import { google } from "googleapis";
import { prisma } from "../lib/prisma.js";
import { encryptSecret } from "../lib/crypto.js";
import { AppError } from "../utils/AppError.js";
import { buildMimeMessage, formatDisplayAddress } from "../lib/mime.js";
import { clientFromStoredConfig, readGmailConfig } from "./gmailAuth.service.js";
import { DEFAULT_DAILY_LIMIT, MAX_SEND_RETRIES, RETRY_BASE_DELAY_MS } from "../config/gmailLimits.js";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadConnectedGmail() {
  const integration = await prisma.integration.findFirst({
    where: { type: "GMAIL", status: "CONNECTED" },
  });
  if (!integration || !integration.config) {
    throw new AppError(409, "No connected Gmail integration.");
  }
  const config = readGmailConfig(integration.config as string);
  return { integration, config };
}

// Resets the counter if the stored date has rolled over, then refuses if today's count is already
// at Gmail's documented daily ceiling — see gmailLimits.ts. This is enforced here, not just
// displayed in the UI, because Google will start hard-rejecting sends past this point anyway and
// we should stop cleanly before that, not retry into it.
async function reserveSendSlot(integrationId: string, config: ReturnType<typeof readGmailConfig>) {
  const today = todayUTC();
  const sentToday = config.sentTodayDate === today ? config.sentToday : 0;
  const limit = config.dailyLimit ?? DEFAULT_DAILY_LIMIT;

  if (sentToday >= limit) {
    throw new AppError(
      429,
      `Daily Gmail sending limit reached (${limit} messages/24h) — raise it in Administration once ` +
        `you've confirmed a higher tier (e.g. switching to a Google Workspace account), or wait for ` +
        `the limit to reset.`,
    );
  }

  const nextConfig = { ...config, sentToday: sentToday + 1, sentTodayDate: today };
  await prisma.integration.update({
    where: { id: integrationId },
    data: { config: encryptSecret(JSON.stringify(nextConfig)) },
  });
  return nextConfig;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  const status = (err as { code?: number; response?: { status?: number } })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmailViaGmail(input: SendEmailInput): Promise<{ providerMessageId: string }> {
  const { integration, config } = await loadConnectedGmail();
  await reserveSendSlot(integration.id, config);

  const client = clientFromStoredConfig(config);

  // Persist a refreshed access token back to encrypted storage so the next send doesn't need to
  // hit Google's token endpoint again unnecessarily.
  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    prisma.integration
      .findUnique({ where: { id: integration.id } })
      .then((current) => {
        if (!current?.config) return;
        const latest = readGmailConfig(current.config as string);
        const updated = {
          ...latest,
          accessToken: tokens.access_token!,
          expiryDate: tokens.expiry_date ?? latest.expiryDate,
        };
        return prisma.integration.update({
          where: { id: integration.id },
          data: { config: encryptSecret(JSON.stringify(updated)) },
        });
      })
      .catch(() => {
        /* best-effort refresh persistence — a failed write here just means one extra token
           refresh next time, not a lost send */
      });
  });

  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = buildMimeMessage({
    from: formatDisplayAddress(config.senderName || config.email, config.email),
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_SEND_RETRIES; attempt++) {
    try {
      const { data } = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      if (!data.id) throw new Error("Gmail API returned no message id");
      return { providerMessageId: data.id };
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt === MAX_SEND_RETRIES) break;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown Gmail API error";
  throw new AppError(502, `Gmail send failed: ${message}`);
}
