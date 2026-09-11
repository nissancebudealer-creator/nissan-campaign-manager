import { prisma } from "../lib/prisma.js";
import { getBackendOrigin } from "../lib/backendUrl.js";

// A 1x1 transparent GIF, the standard email open-tracking technique — every ESP (Mailchimp,
// SendGrid, etc) does exactly this, since no email API exposes real "recipient opened it" events.
// This is real tracking against a real HTTP request the recipient's mail client makes, not
// fabricated data — see COMPLIANCE.md.
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64",
);

export function getTrackingPixel(): Buffer {
  return TRANSPARENT_GIF;
}

export function buildOpenPixelUrl(campaignRecipientId: string): string {
  return `${getBackendOrigin()}/api/track/open/${campaignRecipientId}.gif`;
}

export function buildClickUrl(campaignRecipientId: string): string {
  return `${getBackendOrigin()}/api/track/click/${campaignRecipientId}`;
}

// A recipient row only ever moves forward through PENDING -> SENT -> OPENED -> CLICKED — an open
// pixel firing after a click (out-of-order image loads happen) should never downgrade a CLICKED
// row back to OPENED.
const STATUS_RANK: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  OPENED: 2,
  CLICKED: 3,
};

export async function recordOpen(campaignRecipientId: string): Promise<void> {
  const recipient = await prisma.campaignRecipient.findUnique({ where: { id: campaignRecipientId } });
  if (!recipient) return; // unknown/expired id — serve the pixel anyway, just don't record anything

  if ((STATUS_RANK[recipient.status] ?? 0) < STATUS_RANK.OPENED) {
    await prisma.campaignRecipient.update({
      where: { id: campaignRecipientId },
      data: { status: "OPENED", openedAt: recipient.openedAt ?? new Date() },
    });
  }
}

// Returns the URL to redirect to, or null if the recipient/campaign/CTA doesn't exist — the
// destination is always looked up server-side from what was actually configured on the campaign
// at send time, never taken from the request, so this can't be turned into an open redirect.
export async function recordClickAndGetDestination(campaignRecipientId: string): Promise<string | null> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: campaignRecipientId },
    include: { campaign: true },
  });
  if (!recipient || !recipient.campaign.ctaUrl) return null;

  await prisma.campaignRecipient.update({
    where: { id: campaignRecipientId },
    data: {
      status: "CLICKED",
      clickedAt: recipient.clickedAt ?? new Date(),
      openedAt: recipient.openedAt ?? new Date(),
    },
  });

  return recipient.campaign.ctaUrl;
}
