import { google, type gmail_v1 } from "googleapis";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";
import { clientFromStoredConfig, readGmailConfig } from "./gmailAuth.service.js";
import { MESSAGE_ID_DOMAIN } from "./gmailSend.service.js";

// Gmail search covering the common real bounce-notification shapes ("Mail Delivery Subsystem",
// postmaster/mailer-daemon senders, "Undelivered Mail", etc.) — restricted to the last 30 days
// since a bounce for a campaign send arrives within minutes to hours, never later.
const BOUNCE_SEARCH_QUERY =
  '(from:mailer-daemon OR from:postmaster OR subject:("delivery status notification" OR "undelivered mail" OR "mail delivery failed" OR "returned mail" OR "delivery failure")) newer_than:30d';

// Matches the exact "<uuid@campaign-send.internal>" token we set as Message-ID on every outgoing
// campaign email (see gmailSend.service.ts) — this is what a bounce's In-Reply-To/References
// header is searched for, since that's the only reliable way to know which recipient bounced
// (Gmail's bounce text format for the failed address itself is not standardized enough to parse
// on its own).
export const OWN_MESSAGE_ID_PATTERN = new RegExp(`<[^<>\\s]+@${MESSAGE_ID_DOMAIN.replace(/\./g, "\\.")}>`, "i");

export function getHeader(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string | undefined {
  return payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

// The DSN part (RFC 3464) with the real machine-readable failure reason is often nested inside
// multipart/report > multipart/mixed, so this has to walk the whole tree rather than assume a
// fixed depth.
export function findPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  predicate: (p: gmail_v1.Schema$MessagePart) => boolean,
): gmail_v1.Schema$MessagePart | undefined {
  if (!part) return undefined;
  if (predicate(part)) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

// Best-effort human-readable reason: prefer the structured DSN's Diagnostic-Code/Status (the real
// machine-reported failure, e.g. "smtp; 550 5.1.1 ... does not exist"), fall back to Gmail's own
// snippet of the notification if the DSN part isn't present or doesn't parse as expected.
export function extractBounceReason(message: gmail_v1.Schema$Message): string {
  const dsnPart = findPart(message.payload, (p) => p.mimeType === "message/delivery-status");
  const dsnText = dsnPart?.body?.data ? decodeBase64Url(dsnPart.body.data) : "";
  const diagnostic = dsnText.match(/Diagnostic-Code:\s*(.+)/i)?.[1]?.trim();
  const status = dsnText.match(/Status:\s*(.+)/i)?.[1]?.trim();
  if (diagnostic) return diagnostic;
  if (status) return `Delivery status: ${status}`;
  return message.snippet?.trim() || "Bounced — no further delivery status details were provided.";
}

async function loadReadOnlyGmailClient() {
  const integration = await prisma.integration.findFirst({ where: { type: "GMAIL", status: "CONNECTED" } });
  if (!integration?.config) return null;
  const config = readGmailConfig(integration.config as string);
  const client = clientFromStoredConfig(config);
  return google.gmail({ version: "v1", auth: client });
}

export interface BounceCheckSummary {
  scanned: number;
  correlated: number;
  uncorrelated: number;
}

// Scans the connected Gmail inbox for bounce-notification emails, matches each one back to the
// campaign send that triggered it via the Message-ID we set ourselves (see gmailSend.service.ts),
// and marks that recipient BOUNCED with the real diagnostic text — never inferred, never
// estimated. Safe to call repeatedly (e.g. on the automation interval): already-scanned messages
// are skipped via ProcessedBounceEmail, and a bounce whose Message-ID we don't recognize is
// recorded as scanned but otherwise ignored, not guessed at.
export async function checkForBounces(): Promise<BounceCheckSummary> {
  const gmail = await loadReadOnlyGmailClient();
  if (!gmail) return { scanned: 0, correlated: 0, uncorrelated: 0 };

  const summary: BounceCheckSummary = { scanned: 0, correlated: 0, uncorrelated: 0 };

  let pageToken: string | undefined;
  do {
    const { data } = await gmail.users.messages.list({
      userId: "me",
      q: BOUNCE_SEARCH_QUERY,
      pageToken,
      maxResults: 100,
    });
    const ids = (data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    pageToken = data.nextPageToken ?? undefined;
    if (ids.length === 0) continue;

    const alreadyProcessed = new Set(
      (await prisma.processedBounceEmail.findMany({ where: { gmailMessageId: { in: ids } } })).map(
        (r) => r.gmailMessageId,
      ),
    );
    const toScan = ids.filter((id) => !alreadyProcessed.has(id));

    for (const id of toScan) {
      summary.scanned += 1;
      try {
        const { data: message } = await gmail.users.messages.get({ userId: "me", id, format: "full" });

        const referenceHeaders = [
          getHeader(message.payload, "In-Reply-To"),
          getHeader(message.payload, "References"),
        ].join(" ");
        const ourMessageId = referenceHeaders.match(OWN_MESSAGE_ID_PATTERN)?.[0];

        const campaignMessage = ourMessageId
          ? await prisma.campaignMessage.findFirst({ where: { messageIdHeader: ourMessageId } })
          : null;

        if (campaignMessage) {
          const reason = extractBounceReason(message);
          await prisma.$transaction([
            prisma.campaignMessage.update({
              where: { id: campaignMessage.id },
              data: { rawStatus: "bounced", errorMessage: reason },
            }),
            prisma.campaignRecipient.update({
              where: { id: campaignMessage.campaignRecipientId },
              data: { status: "BOUNCED", errorMessage: reason },
            }),
          ]);
          summary.correlated += 1;
        } else {
          summary.uncorrelated += 1;
        }

        await prisma.processedBounceEmail.create({ data: { gmailMessageId: id } });
      } catch (err) {
        // One malformed/unreadable bounce email should never stop the rest of the batch —
        // leaving it unmarked means it's simply retried next check rather than lost.
        logger.warn("Failed to process a candidate bounce email", {
          gmailMessageId: id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } while (pageToken);

  return summary;
}
