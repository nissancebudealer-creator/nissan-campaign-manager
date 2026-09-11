import { prisma } from "../lib/prisma.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { AppError } from "../utils/AppError.js";
import {
  WHATSAPP_DEFAULT_DAILY_LIMIT,
  MAX_SEND_RETRIES,
  RETRY_BASE_DELAY_MS,
} from "../config/messagingLimits.js";

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string; // Meta System User permanent access token
  wabaId?: string;
  businessName?: string;
  dailyLimit?: number;
  sentToday?: number;
  sentTodayDate?: string;
}

export function readWhatsAppConfig(encrypted: string): WhatsAppConfig {
  return JSON.parse(decryptSecret(encrypted)) as WhatsAppConfig;
}

export function encryptWhatsAppConfig(config: WhatsAppConfig): string {
  return encryptSecret(JSON.stringify(config));
}

function graphErrorMessage(body: unknown): string {
  const err = (body as { error?: { message?: string; error_user_msg?: string } })?.error;
  return err?.error_user_msg || err?.message || "Unknown WhatsApp Cloud API error";
}

// Verifies the phone number ID + access token actually work against Meta's Graph API before we
// ever mark the integration CONNECTED — never trust that pasted credentials are valid.
export async function testWhatsAppConnection(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ verifiedName: string; displayPhoneNumber: string }> {
  const res = await fetch(
    `${GRAPH_API_BASE}/${phoneNumberId}?fields=verified_name,display_phone_number`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = (await res.json()) as { verified_name?: string; display_phone_number?: string };
  if (!res.ok) {
    throw new AppError(502, `Could not verify WhatsApp phone number: ${graphErrorMessage(body)}`);
  }
  return { verifiedName: body.verified_name ?? "", displayPhoneNumber: body.display_phone_number ?? "" };
}

async function loadConnectedWhatsApp() {
  const integration = await prisma.integration.findFirst({
    where: { type: "WHATSAPP", status: "CONNECTED" },
  });
  if (!integration || !integration.config) {
    throw new AppError(409, "No connected WhatsApp integration.");
  }
  const config = readWhatsAppConfig(integration.config as string);
  return { integration, config };
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function reserveSendSlot(integrationId: string, config: WhatsAppConfig) {
  const today = todayUTC();
  const sentToday = config.sentTodayDate === today ? config.sentToday ?? 0 : 0;
  const limit = config.dailyLimit ?? WHATSAPP_DEFAULT_DAILY_LIMIT;

  if (sentToday >= limit) {
    throw new AppError(
      429,
      `Daily WhatsApp sending limit reached (${limit} messages/24h for this number's current ` +
        `messaging tier). Meta raises this automatically as your number's quality rating and ` +
        `volume grow — adjust the configured limit in Integrations once Meta confirms a higher tier.`,
    );
  }

  const nextConfig: WhatsAppConfig = { ...config, sentToday: sentToday + 1, sentTodayDate: today };
  await prisma.integration.update({
    where: { id: integrationId },
    data: { config: encryptWhatsAppConfig(nextConfig) },
  });
  return nextConfig;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(status: number): boolean {
  return status === 429 || status >= 500;
}

interface SendTemplateInput {
  to: string; // E.164 phone number, no leading '+'
  templateName: string;
  templateLanguage: string;
  bodyParams: string[]; // mapped positionally to the approved template's {{1}}, {{2}}, ... variables
}

// Sends a real WhatsApp template message via Meta's Cloud API. Marketing (business-initiated)
// messages MUST use a template pre-approved by Meta — free-form text is only allowed inside an
// existing 24h customer-service session, which a cold marketing campaign is not. See
// COMPLIANCE.md. This never falls back to a plain-text send if the template call fails; it
// reports the real Graph API error instead.
export async function sendWhatsAppTemplateMessage(
  input: SendTemplateInput,
): Promise<{ providerMessageId: string }> {
  const { integration, config } = await loadConnectedWhatsApp();
  await reserveSendSlot(integration.id, config);

  const payload = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.templateLanguage },
      components: input.bodyParams.length
        ? [{ type: "body", parameters: input.bodyParams.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  };

  let lastErrorMessage = "Unknown WhatsApp Cloud API error";
  for (let attempt = 0; attempt <= MAX_SEND_RETRIES; attempt++) {
    const res = await fetch(`${GRAPH_API_BASE}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { messages?: { id: string }[] };
    if (res.ok) {
      const providerMessageId = body?.messages?.[0]?.id;
      if (!providerMessageId) throw new AppError(502, "WhatsApp API returned no message id");
      return { providerMessageId };
    }
    lastErrorMessage = graphErrorMessage(body);
    if (!isTransientError(res.status) || attempt === MAX_SEND_RETRIES) break;
    await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  throw new AppError(502, `WhatsApp send failed: ${lastErrorMessage}`);
}
