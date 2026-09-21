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

// Releases a previously reserved send slot if the send ultimately fails (e.g. rate limit, network
// failure, or API rejection) — ensures failed or throttled attempts never falsely consume the daily limit.
export async function releaseSendSlot(integrationId: string) {
  try {
    const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration?.config) return;
    const config = readGmailConfig(integration.config as string);
    const today = todayUTC();
    if (config.sentTodayDate !== today) return;
    const nextConfig = { ...config, sentToday: Math.max(0, (config.sentToday ?? 1) - 1) };
    await prisma.integration.update({
      where: { id: integrationId },
      data: { config: encryptSecret(JSON.stringify(nextConfig)) },
    });
  } catch {
    // Best-effort rollback — do not mask the underlying send error
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  const status = (err as { code?: number; response?: { status?: number } })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

// Gmail's real per-user sending rate limit — distinct from our own tracked 500/day counter (see
// reserveSendSlot above) — rejects a send with a `Retry after <timestamp>` that's routinely ~15
// minutes out. Our own short exponential backoff (a few seconds total) can never wait that out,
// so retrying here is pure waste — every retry is guaranteed to fail identically. Detected from
// Google's own structured error reason where available, falling back to the message text.
function isRateLimitError(err: unknown): boolean {
  const reason = (err as { errors?: { reason?: string }[] })?.errors?.[0]?.reason;
  if (reason === "userRateLimitExceeded" || reason === "rateLimitExceeded") return true;
  const message = err instanceof Error ? err.message : "";
  return /rate limit exceeded/i.test(message);
}

function extractRateLimitDetail(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const response = (err as { response?: { headers?: Record<string, string> } })?.response;
  const retryAfter = response?.headers?.["retry-after"];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      const minutes = Math.ceil(seconds / 60);
      return `cooldown active, retry in ~${minutes} min`;
    }
    return `retry after ${retryAfter}`;
  }
  const message = err instanceof Error ? err.message : "";
  const retryMatch = message.match(/retry after\s+([^\s.)]+)/i);
  if (retryMatch) {
    return `retry after ${retryMatch[1]}`;
  }
  return undefined;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmailViaGmail(input: SendEmailInput): Promise<{ providerMessageId: string }> {
  const { integration, config } = await loadConnectedGmail();
  await reserveSendSlot(integration.id, config);

  try {
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
        if (isRateLimitError(err) || !isTransientError(err) || attempt === MAX_SEND_RETRIES) break;
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }

    const message = lastError instanceof Error ? lastError.message : "Unknown Gmail API error";
    if (isRateLimitError(lastError)) {
      // Tagged distinctly (not just "Gmail send failed") so campaign.service.ts's send loop can
      // recognize this as a real provider-side throttle — stop the batch and leave the rest of the
      // recipients untouched, the same as hitting our own daily-limit counter — rather than a
      // per-recipient rejection.
      const detail = extractRateLimitDetail(lastError);
      const detailSuffix = detail ? ` [${detail}]` : "";
      throw new AppError(429, `Gmail rate limit reached${detailSuffix}: ${message}`);
    }
    throw new AppError(502, `Gmail send failed: ${message}`);
  } catch (err) {
    await releaseSendSlot(integration.id);
    throw err;
  }
}
