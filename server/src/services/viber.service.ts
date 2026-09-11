import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";
import { getBackendOrigin } from "../lib/backendUrl.js";
import {
  VIBER_DEFAULT_DAILY_LIMIT,
  MAX_SEND_RETRIES,
  RETRY_BASE_DELAY_MS,
} from "../config/messagingLimits.js";

const VIBER_API_BASE = "https://chatapi.viber.com/pa";

export interface ViberConfig {
  authToken: string;
  senderName: string;
  publicAccountUri?: string; // e.g. "yourdealership" from get_account_info's `uri` field
  dailyLimit?: number;
  sentToday?: number;
  sentTodayDate?: string;
}

export function readViberConfig(encrypted: string): ViberConfig {
  return JSON.parse(decryptSecret(encrypted)) as ViberConfig;
}

export function encryptViberConfig(config: ViberConfig): string {
  return encryptSecret(JSON.stringify(config));
}

function viberErrorMessage(body: unknown): string {
  const b = body as { status?: number; status_message?: string };
  return b?.status_message ?? "Unknown Viber API error";
}

// Viber's convention: HTTP 200 on every response, with a `status` field (0 = success) inside the
// body carrying the real result — never trust a 200 status code alone.
function assertViberOk(body: unknown, action: string) {
  const status = (body as { status?: number })?.status;
  if (status !== 0) {
    throw new AppError(502, `Viber ${action} failed: ${viberErrorMessage(body)}`);
  }
}

// Verifies the Public Account auth token actually works, and registers our webhook so Viber will
// call it when a contact subscribes (see handleWebhookEvent) — real setup, not a manual step left
// for the user to configure separately in a Viber dashboard.
export async function testViberConnection(
  authToken: string,
): Promise<{ name: string; uri: string }> {
  const res = await fetch(`${VIBER_API_BASE}/get_account_info`, {
    method: "POST",
    headers: { "X-Viber-Auth-Token": authToken, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = (await res.json()) as { status?: number; status_message?: string; name?: string; uri?: string };
  assertViberOk(body, "account verification");

  const webhookUrl = `${getBackendOrigin()}/api/webhooks/viber`;
  const webhookRes = await fetch(`${VIBER_API_BASE}/set_webhook`, {
    method: "POST",
    headers: { "X-Viber-Auth-Token": authToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      event_types: ["conversation_started", "subscribed", "unsubscribed", "message"],
    }),
  });
  const webhookBody = await webhookRes.json();
  assertViberOk(webhookBody, "webhook registration");

  return { name: body.name ?? "", uri: body.uri ?? "" };
}

// ---------- Subscriber invite links ----------
// Viber requires a contact to message your Public Account before you can ever send to them — this
// app cannot and does not bypass that. An invite link is how a dealership shares a one-tap "start
// chatting with us on Viber" link with a specific lead (e.g. via SMS or in person); Viber echoes
// the signed `context` value back in the resulting `conversation_started` webhook event, which is
// how we attribute the new Viber user id to the right Contact record without ever guessing.
function signContext(contactId: string): string {
  const signature = crypto
    .createHmac("sha256", env.VIBER_INVITE_SECRET)
    .update(contactId)
    .digest("hex");
  return Buffer.from(`${contactId}:${signature}`).toString("base64url");
}

export function verifyContext(context: string): string | null {
  try {
    const decoded = Buffer.from(context, "base64url").toString("utf8");
    const [contactId, signature] = decoded.split(":");
    if (!contactId || !signature) return null;
    const expected = crypto
      .createHmac("sha256", env.VIBER_INVITE_SECRET)
      .update(contactId)
      .digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    return contactId;
  } catch {
    return null;
  }
}

export function buildViberInviteLink(publicAccountUri: string, contactId: string): string {
  const context = signContext(contactId);
  return `viber://pa?chatURI=${encodeURIComponent(publicAccountUri)}&context=${encodeURIComponent(context)}`;
}

// Viber signs every webhook request body with HMAC-SHA256 (using your auth token as the key) in
// the `X-Viber-Content-Signature` header — verify it before trusting anything in the payload,
// otherwise a forged request could plant a fake viberUserId on any contact.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined, authToken: string): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", authToken).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signatureHeader, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
}

interface ViberWebhookEvent {
  event: "conversation_started" | "subscribed" | "unsubscribed" | "message" | "webhook" | "delivered" | "seen" | "failed";
  user?: { id: string };
  context?: string;
}

// Applies one verified webhook event: attributes a real Viber user id to the Contact that
// generated the invite link (conversation_started/subscribed carrying our `context`), or clears
// it on unsubscribe so a revoked opt-in can never still receive a send.
export async function handleWebhookEvent(event: ViberWebhookEvent) {
  if ((event.event === "conversation_started" || event.event === "subscribed") && event.context && event.user) {
    const contactId = verifyContext(event.context);
    if (!contactId) return; // unrecognized/forged context — silently ignore, never trust it
    await prisma.contact.updateMany({
      where: { id: contactId },
      data: { viberUserId: event.user.id, viberSubscribedAt: new Date() },
    });
    return;
  }
  if (event.event === "unsubscribed" && event.user) {
    await prisma.contact.updateMany({
      where: { viberUserId: event.user.id },
      data: { viberUserId: null, viberSubscribedAt: null },
    });
  }
}

async function loadConnectedViber() {
  const integration = await prisma.integration.findFirst({
    where: { type: "VIBER", status: "CONNECTED" },
  });
  if (!integration || !integration.config) {
    throw new AppError(409, "No connected Viber integration.");
  }
  const config = readViberConfig(integration.config as string);
  return { integration, config };
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function reserveSendSlot(integrationId: string, config: ViberConfig) {
  const today = todayUTC();
  const sentToday = config.sentTodayDate === today ? config.sentToday ?? 0 : 0;
  const limit = config.dailyLimit ?? VIBER_DEFAULT_DAILY_LIMIT;

  if (sentToday >= limit) {
    throw new AppError(
      429,
      `Daily Viber sending limit reached (${limit} messages/24h, a conservative default — adjust ` +
        `it in Integrations once you know your account's actual contracted throughput).`,
    );
  }

  const nextConfig: ViberConfig = { ...config, sentToday: sentToday + 1, sentTodayDate: today };
  await prisma.integration.update({
    where: { id: integrationId },
    data: { config: encryptViberConfig(nextConfig) },
  });
  return nextConfig;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SendViberMessageInput {
  receiverId: string; // real Viber user id captured via the webhook — never a raw phone number
  text: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export async function sendViberMessage(input: SendViberMessageInput): Promise<{ providerMessageId: string }> {
  const { integration, config } = await loadConnectedViber();
  await reserveSendSlot(integration.id, config);

  const text = input.ctaUrl
    ? `${input.text}\n\n${input.ctaLabel ?? "Learn more"}: ${input.ctaUrl}`
    : input.text;

  const payload = {
    receiver: input.receiverId,
    type: "text",
    sender: { name: config.senderName },
    text,
  };

  let lastErrorMessage = "Unknown Viber API error";
  for (let attempt = 0; attempt <= MAX_SEND_RETRIES; attempt++) {
    const res = await fetch(`${VIBER_API_BASE}/send_message`, {
      method: "POST",
      headers: { "X-Viber-Auth-Token": config.authToken, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { status?: number; status_message?: string; message_token?: number };
    if (body.status === 0) {
      return { providerMessageId: String(body.message_token) };
    }
    lastErrorMessage = viberErrorMessage(body);
    // Viber has no documented transient-vs-permanent status taxonomy the way Meta/Gmail do —
    // only retry on a real HTTP-level failure, not a normal application-level rejection.
    if (res.ok || attempt === MAX_SEND_RETRIES) break;
    await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  throw new AppError(502, `Viber send failed: ${lastErrorMessage}`);
}
