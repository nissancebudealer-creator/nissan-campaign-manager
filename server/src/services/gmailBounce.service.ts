import { google, type gmail_v1 } from "googleapis";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";
import { clientFromStoredConfig, readGmailConfig } from "./gmailAuth.service.js";

// Gmail search covering the common real bounce-notification shapes ("Mail Delivery Subsystem",
// postmaster/mailer-daemon senders, "Undelivered Mail", etc.) — restricted to the last 30 days
// since a bounce for a campaign send arrives within minutes to hours, never later.
const BOUNCE_SEARCH_QUERY =
  '(from:mailer-daemon OR from:postmaster OR subject:("delivery status notification" OR "undelivered mail" OR "mail delivery failed" OR "returned mail" OR "delivery failure")) newer_than:30d';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Correlation originally tried matching a Message-ID we set ourselves on the outgoing email back
// against a bounce's In-Reply-To/References header. Confirmed against real bounces in this
// account's inbox that this doesn't work: Gmail's users.messages.send replaces any custom
// Message-ID header with its own "<...>@mail.gmail.com" one before sending, so our header never
// appears anywhere in the resulting bounce. Real bounce notifications reliably name the failed
// address directly instead ("Your message wasn't delivered to X because...", "There was a
// temporary problem delivering your message to X..."), present in Gmail's own snippet — so this
// extracts that address and matches it to the most recent not-yet-bounced EMAIL send to that
// contact, rather than depending on a header Gmail doesn't preserve.
export function extractFailedAddress(message: gmail_v1.Schema$Message): string | undefined {
  return message.snippet?.match(EMAIL_PATTERN)?.[0]?.toLowerCase();
}

export function getHeader(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string | undefined {
  return payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

// The DSN part (RFC 3464) with the real machine-readable failure reason is often nested inside
// multipart/report > multipart/related, so this has to walk the whole tree rather than assume a
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
// snippet of the notification if the DSN part isn't present, has no inline body, or doesn't parse
// as expected — the snippet is always present and, in practice, is usually the clearer text anyway
// (it's what a human reads in the inbox).
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gmail enforces its own per-user read quota (separate from the sending one in gmailLimits.ts) —
// a `messages.get(format: "full")` costs real quota units, and fetching a large backlog back to
// back trips a real 403 "rateLimitExceeded" from the API. Pacing these calls, and capping how many
// this one tick processes, keeps a large backlog safe to work through across several 5-minute
// ticks instead of risking that quota (or starving other Gmail API use) in one burst.
const BOUNCE_CHECK_DELAY_MS = 400;
const MAX_BOUNCES_PER_CHECK = 80;

// Scans the connected Gmail inbox for bounce-notification emails, matches each one back to the
// real campaign send that triggered it (see extractFailedAddress above for why this is done by
// address rather than Message-ID), and marks that recipient BOUNCED with the real diagnostic
// text — never inferred, never estimated. Safe to call repeatedly (e.g. on the automation
// interval): already-scanned messages are skipped via ProcessedBounceEmail, a bounce we can't
// attribute to any known send is recorded as scanned but otherwise ignored (not guessed at), and
// an interruption partway through (Gmail's own read quota, a network hiccup) returns whatever was
// genuinely processed rather than throwing — the rest of a large backlog just continues next tick.
export async function checkForBounces(): Promise<BounceCheckSummary> {
  const summary: BounceCheckSummary = { scanned: 0, correlated: 0, uncorrelated: 0 };
  try {
    const gmail = await loadReadOnlyGmailClient();
    if (!gmail) return summary;

    let pageToken: string | undefined;
    scanLoop: do {
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
        if (summary.scanned >= MAX_BOUNCES_PER_CHECK) break scanLoop;
        summary.scanned += 1;
        try {
          const { data: message } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
          const failedAddress = extractFailedAddress(message);

          // The most recent EMAIL send to this exact address that hasn't already been marked
          // bounced — a real, if imprecise for a contact sent multiple campaigns in close
          // succession, correlation. Excluding already-bounced ones means a second DSN for the
          // same underlying send (Gmail sometimes emits a "delayed" warning before a final
          // failure) won't get misattributed to some earlier, unrelated send to the same address.
          const campaignMessage = failedAddress
            ? await prisma.campaignMessage.findFirst({
                where: {
                  channel: "EMAIL",
                  rawStatus: "sent",
                  campaignRecipient: { contact: { email: { equals: failedAddress, mode: "insensitive" } } },
                },
                orderBy: { sentAt: "desc" },
              })
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

        await sleep(BOUNCE_CHECK_DELAY_MS);
      }
    } while (pageToken);
  } catch (err) {
    logger.warn("Gmail bounce check stopped early", {
      message: err instanceof Error ? err.message : String(err),
      ...summary,
    });
  }

  return summary;
}
