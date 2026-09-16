import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

// Every number here comes from a real row in campaign_recipients / campaign_messages, written
// either by an actual Gmail API response (SENT/FAILED) or a real HTTP request the recipient's
// mail client made (OPENED via the tracking pixel, CLICKED via the redirect link) — see
// COMPLIANCE.md. Two things are deliberately absent, not estimated:
//   - "Delivered": Gmail's send API confirms acceptance for delivery, not final inbox delivery.
//     We report "Sent" (the real signal we have) rather than claim "Delivered".
//   - "Conversion": no goal/e-commerce integration exists to attribute a conversion to a send.

interface RecipientCounts {
  recipients: number;
  sent: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

async function countRecipients(campaignId: string): Promise<RecipientCounts> {
  const rows = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const byStatus: Record<string, number> = {};
  let recipients = 0;
  for (const row of rows) {
    byStatus[row.status] = row._count._all;
    recipients += row._count._all;
  }

  // "Currently unsubscribed" = recipients of this campaign whose contact is presently suppressed
  // on this channel — a real, current fact, not an assertion that they unsubscribed *because of*
  // this specific send (the unsubscribe token doesn't carry which campaign triggered it).
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  const unsubscribed = campaign
    ? await prisma.campaignRecipient.count({
        where: { campaignId, contact: { suppressions: { some: { channel: campaign.channel } } } },
      })
    : 0;

  // SENT/OPENED/CLICKED/BOUNCED are all states a *successfully sent* message can currently be in
  // — a recipient who opened, clicked, or bounced was, by definition, sent to first. "Sent" here
  // means "the provider accepted this for delivery", regardless of what happened to it afterward
  // — a bounce is a real, separately-reported outcome, not a subtraction from "sent".
  const successfullySent =
    (byStatus.SENT ?? 0) + (byStatus.OPENED ?? 0) + (byStatus.CLICKED ?? 0) + (byStatus.BOUNCED ?? 0);

  return {
    recipients,
    sent: successfullySent,
    failed: byStatus.FAILED ?? 0,
    // Only ever non-zero for EMAIL — a real bounce-notification email matched back to this send
    // via its Message-ID (see gmailBounce.service.ts), not inferred from silence or time elapsed.
    bounced: byStatus.BOUNCED ?? 0,
    opened: (byStatus.OPENED ?? 0) + (byStatus.CLICKED ?? 0),
    clicked: byStatus.CLICKED ?? 0,
    unsubscribed,
  };
}

function withRates(counts: RecipientCounts) {
  const base = counts.sent > 0 ? counts.sent : counts.recipients;
  return {
    ...counts,
    openRate: base > 0 ? counts.opened / base : 0,
    clickRate: base > 0 ? counts.clicked / base : 0,
  };
}

export async function getCampaignMetrics(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError(404, "Campaign not found");
  const counts = await countRecipients(campaignId);
  return { campaign, metrics: withRates(counts) };
}

export async function listCampaignsWithMetrics() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ["SENDING", "SENT", "FAILED"] } },
    orderBy: { sentAt: "desc" },
    include: { segment: true },
  });

  const withMetrics = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      metrics: withRates(await countRecipients(campaign.id)),
    })),
  );

  return withMetrics;
}

export async function getDashboardSummary() {
  const [totalContacts, activeCampaigns, scheduledCampaigns, campaignsSent, recentCampaigns] =
    await Promise.all([
      prisma.contact.count(),
      prisma.campaign.count({ where: { status: "SENDING" } }),
      prisma.campaign.count({ where: { status: "SCHEDULED" } }),
      prisma.campaign.count({ where: { status: "SENT" } }),
      prisma.campaign.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, name: true, channel: true, status: true, updatedAt: true },
      }),
    ]);

  const sentCampaigns = await prisma.campaign.findMany({
    where: { status: { in: ["SENT", "SENDING", "FAILED"] } },
    select: { id: true, channel: true, sentAt: true },
  });

  const channelPerformance: Record<
    string,
    { sent: number; opened: number; clicked: number; bounced: number }
  > = {
    EMAIL: { sent: 0, opened: 0, clicked: 0, bounced: 0 },
    WHATSAPP: { sent: 0, opened: 0, clicked: 0, bounced: 0 },
    VIBER: { sent: 0, opened: 0, clicked: 0, bounced: 0 },
  };
  const campaignVolumeByMonth: Record<string, number> = {};

  for (const campaign of sentCampaigns) {
    const counts = await countRecipients(campaign.id);
    channelPerformance[campaign.channel].sent += counts.sent;
    channelPerformance[campaign.channel].opened += counts.opened;
    channelPerformance[campaign.channel].clicked += counts.clicked;
    channelPerformance[campaign.channel].bounced += counts.bounced;

    if (campaign.sentAt) {
      const monthKey = campaign.sentAt.toISOString().slice(0, 7); // YYYY-MM
      campaignVolumeByMonth[monthKey] = (campaignVolumeByMonth[monthKey] ?? 0) + 1;
    }
  }

  return {
    totalContacts,
    activeCampaigns,
    scheduledCampaigns,
    campaignsSent,
    channelPerformance,
    campaignVolumeByMonth,
    recentActivity: recentCampaigns,
  };
}
