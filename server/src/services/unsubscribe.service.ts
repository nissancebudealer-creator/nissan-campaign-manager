import crypto from "node:crypto";
import type { ConsentChannel } from "@prisma/client";
import { env } from "../config/env.js";
import { getBackendOrigin } from "../lib/backendUrl.js";
import { setConsent } from "./consent.service.js";

function sign(payload: string): string {
  return crypto.createHmac("sha256", env.UNSUBSCRIBE_SECRET).update(payload).digest("hex");
}

// A signed, tamper-resistant token — not just a raw contact id — so unsubscribe links can't be
// guessed or used to opt out a contact who never received this link.
export function generateUnsubscribeToken(contactId: string, channel: ConsentChannel): string {
  const payload = `${contactId}:${channel}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function verifyUnsubscribeToken(
  token: string,
): { contactId: string; channel: ConsentChannel } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [contactId, channel, signature] = decoded.split(":");
    if (!contactId || !channel || !signature) return null;
    const expected = sign(`${contactId}:${channel}`);
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    return { contactId, channel: channel as ConsentChannel };
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(contactId: string, channel: ConsentChannel): string {
  const token = generateUnsubscribeToken(contactId, channel);
  return `${getBackendOrigin()}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function processUnsubscribeToken(token: string) {
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) {
    return { ok: false as const };
  }
  await setConsent({
    contactId: parsed.contactId,
    channel: parsed.channel,
    optIn: false,
    consentSource: "Unsubscribe link",
    actorId: null,
  });
  return { ok: true as const, channel: parsed.channel };
}
