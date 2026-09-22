import type { CampaignStatus, Channel, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";
import { buildRulesWhere } from "./segment.service.js";
import { rulesSchema } from "../schemas/segment.schema.js";
import type { TemplateCategory } from "../config/templateCategories.js";
import type { IntegrationType } from "@prisma/client";
import { renderPersonalization } from "../config/personalization.js";
import { renderEmailHtml } from "../lib/renderEmailHtml.js";
import { buildUnsubscribeUrl } from "./unsubscribe.service.js";
import { sendEmailViaGmail } from "./gmailSend.service.js";
import { SEND_DELAY_MS } from "../config/gmailLimits.js";
import { buildClickUrl, buildOpenPixelUrl } from "./tracking.service.js";
import { sendWhatsAppTemplateMessage } from "./whatsapp.service.js";
import { sendViberMessage } from "./viber.service.js";
import { extractUsedVariables, type PersonalizationContext } from "../config/personalization.js";

// Campaign.channel (EMAIL/WHATSAPP/VIBER) and Integration.type (GMAIL/WHATSAPP/VIBER) are
// separate enums — EMAIL campaigns send through a connected Gmail integration specifically.
const CHANNEL_TO_INTEGRATION_TYPE: Record<Channel, IntegrationType> = {
  EMAIL: "GMAIL",
  WHATSAPP: "WHATSAPP",
  VIBER: "VIBER",
};

interface CampaignInput {
  name: string;
  type: TemplateCategory;
  channel: Channel;
  segmentId: string;
  templateId?: string | null;
  subject?: string | null;
  message: string;
  imageUrl?: string | null;
  imagePosition?: "TOP" | "BOTTOM";
  videoUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  whatsappTemplateName?: string | null;
  whatsappTemplateLanguage?: string | null;
  tagIds?: string[];
}

const EDITABLE_STATUSES: CampaignStatus[] = ["DRAFT", "SCHEDULED", "PAUSED"];

const campaignInclude = {
  segment: true,
  template: true,
  senderIntegration: true,
  tags: { include: { tag: true } },
};

export function listCampaigns(filters: { status?: CampaignStatus; channel?: Channel; includeArchived?: boolean }) {
  return prisma.campaign.findMany({
    // Archived campaigns are hidden from the default list — only surfaced when explicitly asked
    // for, so "old, out of the way" doesn't silently reappear in everyday views.
    where: { status: filters.status, channel: filters.channel, isArchived: filters.includeArchived ? undefined : false },
    include: campaignInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function archiveCampaign(id: string, actorId: string, archived: boolean) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { isArchived: archived },
    include: campaignInclude,
  });
  await recordAudit({
    userId: actorId,
    action: archived ? "CAMPAIGN_ARCHIVED" : "CAMPAIGN_UNARCHIVED",
    entityType: "Campaign",
    entityId: id,
    metadata: { name: existing.name },
  });
  return campaign;
}

// Everyone this campaign's segment/channel would still reach that it hasn't already sent to —
// shared by requestSend (what to actually attempt) and getCampaign (what to show as "remaining"
// in the UI, so an admin closing and reopening the page still sees accurate batch progress).
// A FAILED recipient is a real, completed attempt (the provider genuinely rejected it) — not
// silently retried by a later "send"/"send next batch" call, only PENDING (never got a real
// provider response, e.g. cut short by a daily-limit break) or never-attempted contacts are.
async function buildUnsentRecipientsWhere(campaign: {
  id: string;
  segmentId: string | null;
  channel: Channel;
}): Promise<Prisma.ContactWhereInput> {
  const segment = await prisma.segment.findUniqueOrThrow({ where: { id: campaign.segmentId! } });
  return {
    AND: [
      buildRulesWhere(rulesSchema.parse(segment.rulesJson)),
      deliverableWhere(campaign.channel),
      channelAddressWhere(campaign.channel),
      { campaignRecipients: { none: { campaignId: campaign.id, status: { in: ["SENT", "FAILED"] } } } },
    ],
  };
}

export async function getCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id }, include: campaignInclude });
  if (!campaign) throw new AppError(404, "Campaign not found");

  const sentCount = await prisma.campaignRecipient.count({ where: { campaignId: id, status: "SENT" } });
  // Only meaningful once a real send has started — cheap to skip for DRAFT/SCHEDULED/etc, and
  // trivially 0 once terminal (SENT/CANCELLED/FAILED never leave anything queued).
  const remainingCount =
    campaign.segmentId && (campaign.status === "SENDING" || campaign.status === "PAUSED")
      ? await prisma.contact.count({ where: await buildUnsentRecipientsWhere(campaign) })
      : 0;

  return { ...campaign, sentCount, remainingCount };
}

export async function createCampaign(input: CampaignInput, actorId: string) {
  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      type: input.type,
      channel: input.channel,
      segmentId: input.segmentId,
      templateId: input.templateId || null,
      subject: input.channel === "EMAIL" ? input.subject || null : null,
      message: input.message,
      imageUrl: input.imageUrl || null,
      imagePosition: input.imagePosition || "TOP",
      videoUrl: input.videoUrl || null,
      ctaLabel: input.ctaLabel || null,
      ctaUrl: input.ctaUrl || null,
      whatsappTemplateName: input.channel === "WHATSAPP" ? input.whatsappTemplateName || null : null,
      whatsappTemplateLanguage:
        input.channel === "WHATSAPP" ? input.whatsappTemplateLanguage || "en" : null,
      status: "DRAFT",
      createdById: actorId,
      tags: input.tagIds?.length ? { create: input.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    include: campaignInclude,
  });
  await recordAudit({ userId: actorId, action: "CAMPAIGN_CREATED", entityType: "Campaign", entityId: campaign.id });
  return campaign;
}

function assertEditable(status: CampaignStatus) {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new AppError(409, `Cannot edit a campaign that is ${status.toLowerCase()}`);
  }
}

export async function updateCampaign(id: string, input: Partial<CampaignInput>, actorId: string) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  assertEditable(existing.status);

  const nextChannel = input.channel ?? existing.channel;
  const nextSubject = input.subject !== undefined ? input.subject : existing.subject;

  if (input.tagIds !== undefined) {
    await prisma.campaignTag.deleteMany({ where: { campaignId: id } });
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      channel: input.channel,
      segmentId: input.segmentId,
      templateId: input.templateId === undefined ? undefined : input.templateId || null,
      subject: nextChannel === "EMAIL" ? nextSubject || null : null,
      message: input.message,
      imageUrl: input.imageUrl === undefined ? undefined : input.imageUrl || null,
      imagePosition: input.imagePosition,
      videoUrl: input.videoUrl === undefined ? undefined : input.videoUrl || null,
      ctaLabel: input.ctaLabel === undefined ? undefined : input.ctaLabel || null,
      ctaUrl: input.ctaUrl === undefined ? undefined : input.ctaUrl || null,
      whatsappTemplateName:
        nextChannel === "WHATSAPP" ? input.whatsappTemplateName || existing.whatsappTemplateName || null : null,
      whatsappTemplateLanguage:
        nextChannel === "WHATSAPP"
          ? input.whatsappTemplateLanguage || existing.whatsappTemplateLanguage || "en"
          : null,
      tags: input.tagIds ? { create: input.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    include: campaignInclude,
  });
  await recordAudit({ userId: actorId, action: "CAMPAIGN_UPDATED", entityType: "Campaign", entityId: id });
  return campaign;
}

// A non-draft campaign carries real send/open/click history — deleting one is a genuinely
// destructive action, not just tidying up a draft. Marketing Manager keeps the existing
// draft-only deletion; only an Administrator can delete a campaign in any status, and every such
// deletion is audited with enough metadata (status, recipient count) to leave a trace even though
// the underlying rows are gone (cascade-deletes CampaignRecipient/CampaignMessage/CampaignTag).
export async function deleteCampaign(id: string, actorId: string, actorRole: string) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  if (existing.status !== "DRAFT" && actorRole !== "ADMINISTRATOR") {
    throw new AppError(
      409,
      "Only a draft campaign can be deleted — cancel it first if it's scheduled, or ask an " +
        "Administrator to delete it.",
    );
  }
  const recipientCount =
    existing.status === "DRAFT" ? 0 : await prisma.campaignRecipient.count({ where: { campaignId: id } });
  await prisma.campaign.delete({ where: { id } });
  await recordAudit({
    userId: actorId,
    action: "CAMPAIGN_DELETED",
    entityType: "Campaign",
    entityId: id,
    metadata: { name: existing.name, status: existing.status, recipientCount },
  });
}

export async function duplicateCampaign(id: string, actorId: string) {
  const original = await prisma.campaign.findUnique({ where: { id }, include: { tags: true } });
  if (!original) throw new AppError(404, "Campaign not found");

  const copy = await prisma.campaign.create({
    data: {
      name: `${original.name} (Copy)`,
      type: original.type,
      channel: original.channel,
      segmentId: original.segmentId,
      templateId: original.templateId,
      subject: original.subject,
      message: original.message,
      imageUrl: original.imageUrl,
      imagePosition: original.imagePosition,
      videoUrl: original.videoUrl,
      ctaLabel: original.ctaLabel,
      ctaUrl: original.ctaUrl,
      whatsappTemplateName: original.whatsappTemplateName,
      whatsappTemplateLanguage: original.whatsappTemplateLanguage,
      status: "DRAFT",
      createdById: actorId,
      tags: original.tags.length
        ? { create: original.tags.map((t) => ({ tagId: t.tagId })) }
        : undefined,
    },
    include: campaignInclude,
  });
  await recordAudit({
    userId: actorId,
    action: "CAMPAIGN_DUPLICATED",
    entityType: "Campaign",
    entityId: copy.id,
    metadata: { fromCampaignId: id },
  });
  return copy;
}

// ---------- Audience preview ----------
// Pure read-only computation: never persists CampaignRecipient rows here. Rows only get created
// at actual send time, once a real provider exists to act on them — otherwise this would be
// exactly the "fabricated tracking data" COMPLIANCE.md rules out.
//
// Deliverability requires BOTH an explicit recorded opt-in for this channel AND no active
// suppression — matching COMPLIANCE.md's promise that the platform never sends to a contact
// without a recorded opt-in, not just "hasn't explicitly opted out". A contact with no consent
// record at all for this channel is excluded, the same as one who opted out.
export function deliverableWhere(channel: Channel): Prisma.ContactWhereInput {
  return {
    consents: { some: { channel, optIn: true } },
    suppressions: { none: { channel } },
  };
}

// The field that actually carries a deliverable address per channel. For Viber this is
// deliberately `viberUserId` — the real Viber user id captured only once a contact has messaged
// the Public Account — never the raw `viberNumber` phone field, which Viber's API can't send to.
// See viber.service.ts and COMPLIANCE.md.
export function channelAddressWhere(channel: Channel): Prisma.ContactWhereInput {
  switch (channel) {
    case "EMAIL":
      // emailDomainValid is a real DNS MX-record check computed once at creation/import time (see
      // emailDomainValidation.ts), not re-checked here — excludes only a domain CONFIRMED to have
      // no mail server (false). null (never checked) and true both pass, so contacts that predate
      // this feature keep working exactly as before. Spelled out as an explicit OR rather than
      // `NOT: { emailDomainValid: false }` — confirmed against the real database that Prisma's NOT
      // compiles to SQL's `!= false`, and by SQL's three-valued logic a NULL column never satisfies
      // that comparison, which would have silently excluded every contact created before this
      // field existed (all of them, at first) from every EMAIL campaign.
      return { email: { not: null }, OR: [{ emailDomainValid: null }, { emailDomainValid: true }] };
    case "WHATSAPP":
      return { whatsappNumber: { not: null } };
    case "VIBER":
      return { viberUserId: { not: null } };
  }
}

export async function previewAudience(segmentId: string, channel: Channel) {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
  if (!segment) throw new AppError(404, "Segment not found");

  const rules = rulesSchema.parse(segment.rulesJson);
  const segmentWhere = buildRulesWhere(rules);
  const addressWhere = channelAddressWhere(channel);

  const deliverableWhereClause: Prisma.ContactWhereInput = {
    AND: [segmentWhere, deliverableWhere(channel), addressWhere],
  };
  const optedOutWhere: Prisma.ContactWhereInput = {
    AND: [segmentWhere, { suppressions: { some: { channel } } }],
  };
  const noConsentWhere: Prisma.ContactWhereInput = {
    AND: [segmentWhere, { consents: { none: { channel } } }, { suppressions: { none: { channel } } }],
  };
  // Consented, not suppressed, but missing the actual channel-specific address — for Viber this
  // is the common, expected case for a lead who's opted in but hasn't yet subscribed on Viber.
  const noAddressWhere: Prisma.ContactWhereInput = {
    AND: [segmentWhere, deliverableWhere(channel), { NOT: addressWhere }],
  };

  const [totalMatching, optedOutCount, noConsentCount, noAddressCount, sample] = await Promise.all([
    prisma.contact.count({ where: segmentWhere }),
    prisma.contact.count({ where: optedOutWhere }),
    prisma.contact.count({ where: noConsentWhere }),
    prisma.contact.count({ where: noAddressWhere }),
    prisma.contact.findMany({ where: deliverableWhereClause, take: 5, orderBy: { createdAt: "desc" } }),
  ]);

  return {
    totalMatching,
    optedOutCount,
    noConsentCount,
    noAddressCount,
    estimatedMessages: totalMatching - optedOutCount - noConsentCount - noAddressCount,
    sample,
  };
}

// ---------- Lifecycle ----------

export async function scheduleCampaign(id: string, scheduledAt: Date, actorId: string) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  if (existing.status !== "DRAFT" && existing.status !== "PAUSED") {
    throw new AppError(409, `Cannot schedule a campaign that is ${existing.status.toLowerCase()}`);
  }
  if (scheduledAt.getTime() <= Date.now()) {
    throw new AppError(400, "Scheduled time must be in the future");
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "SCHEDULED", scheduledAt },
    include: campaignInclude,
  });
  await recordAudit({
    userId: actorId,
    action: "CAMPAIGN_SCHEDULED",
    entityType: "Campaign",
    entityId: id,
    metadata: { scheduledAt },
  });
  return campaign;
}

export async function pauseCampaign(id: string, actorId: string) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  if (existing.status !== "SCHEDULED" && existing.status !== "SENDING") {
    throw new AppError(409, `Cannot pause a campaign that is ${existing.status.toLowerCase()}`);
  }
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED" },
    include: campaignInclude,
  });
  await recordAudit({ userId: actorId, action: "CAMPAIGN_PAUSED", entityType: "Campaign", entityId: id });
  return campaign;
}

export async function cancelCampaign(id: string, actorId: string) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  if (!["DRAFT", "SCHEDULED", "PAUSED"].includes(existing.status)) {
    throw new AppError(409, `Cannot cancel a campaign that is ${existing.status.toLowerCase()}`);
  }
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: campaignInclude,
  });
  await recordAudit({ userId: actorId, action: "CAMPAIGN_CANCELLED", entityType: "Campaign", entityId: id });
  return campaign;
}

// ---------- Send (gated on a connected integration — see Integration model) ----------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SENDABLE_STATUSES: CampaignStatus[] = ["DRAFT", "SCHEDULED", "SENDING", "PAUSED"];

export async function requestSend(
  id: string,
  actorId: string,
  options: { testMode: boolean; batchSize?: number },
) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  // SENDING/PAUSED are both resendable here — a campaign whose audience exceeded one batch (or
  // the provider's daily limit) stays in SENDING between calls rather than a one-shot terminal
  // status, and calling send again on it (or on one explicitly PAUSED) is exactly "send the next
  // batch" / "resume".
  if (!SENDABLE_STATUSES.includes(existing.status)) {
    throw new AppError(409, `Cannot send a campaign that is ${existing.status.toLowerCase()}`);
  }

  const integration = await prisma.integration.findFirst({
    where: { type: CHANNEL_TO_INTEGRATION_TYPE[existing.channel], status: "CONNECTED" },
  });

  if (!integration) {
    throw new AppError(
      409,
      `No connected ${existing.channel} integration. Connect one in Integrations before sending — ` +
        `this platform never simulates a send or fabricates delivery data.`,
    );
  }

  if (options.testMode) {
    if (existing.channel !== "EMAIL") {
      // WhatsApp templates can only be verified against Meta's own pre-registered test numbers
      // (configured in Meta Business Manager, not something this app can pick at runtime), and
      // Viber has no concept of a "test send" separate from actually messaging a real subscriber.
      // A small real segment (e.g. just yourself, once subscribed) is the honest equivalent.
      throw new AppError(
        400,
        `Test send isn't available for ${existing.channel} — WhatsApp requires a Meta-registered ` +
          `test number and Viber requires a real subscribed recipient. Send to a small real ` +
          `segment instead to verify the message.`,
      );
    }

    const actor = await prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new AppError(404, "Requesting user not found");

    const subject = renderPersonalization(existing.subject ?? "", {
      first_name: actor.firstName,
      last_name: actor.lastName,
    });
    const html = renderEmailHtml({
      message: renderPersonalization(existing.message, {
        first_name: actor.firstName,
        last_name: actor.lastName,
      }),
      imageUrl: existing.imageUrl,
      imagePosition: existing.imagePosition,
      ctaLabel: existing.ctaLabel,
      ctaUrl: existing.ctaUrl,
      unsubscribeUrl: buildUnsubscribeUrl(actor.id, "EMAIL"),
    });

    await sendEmailViaGmail({ to: actor.email, subject: `[TEST] ${subject}`, html });
    await recordAudit({
      userId: actorId,
      action: "CAMPAIGN_TEST_SENT",
      entityType: "Campaign",
      entityId: id,
      metadata: { to: actor.email },
    });
    return { testSentTo: actor.email };
  }

  if (existing.channel === "WHATSAPP" && !existing.whatsappTemplateName) {
    throw new AppError(
      400,
      "This campaign has no WhatsApp template configured. Marketing messages must use a " +
        "Meta-approved template — set one on the campaign before sending.",
    );
  }

  const where = await buildUnsentRecipientsWhere(existing);
  const eligibleRecipients = await prisma.contact.findMany({ where });
  if (eligibleRecipients.length === 0) {
    throw new AppError(
      400,
      "No recipients left to send to — every matching contact has either already been sent to, " +
        "is suppressed, is missing a recorded opt-in for this channel, or is missing a " +
        "deliverable address for this channel (e.g. not yet subscribed on Viber).",
    );
  }
  const recipients =
    options.batchSize && options.batchSize > 0 ? eligibleRecipients.slice(0, options.batchSize) : eligibleRecipients;

  await prisma.campaign.update({ where: { id }, data: { status: "SENDING" } });

  // Body variable names in the order they appear in the campaign message — mapped positionally to
  // an approved WhatsApp template's numbered {{1}}, {{2}}, ... placeholders. Computed once, since
  // it only depends on the campaign's own message text, not the recipient.
  const whatsappBodyVariables = existing.channel === "WHATSAPP" ? extractUsedVariables(existing.message) : [];

  let sentCount = 0;
  let failedCount = 0;
  // Set only when a provider throttle (not a per-recipient rejection) stops the batch early — the
  // real reason surfaced to the admin, instead of a bare "0 sent" with no explanation.
  let throttledReason: string | undefined;
  let throttledUntil: string | undefined;

  for (const contact of recipients) {
    const campaignRecipient = await prisma.campaignRecipient.upsert({
      where: { campaignId_contactId: { campaignId: id, contactId: contact.id } },
      update: { status: "PENDING", errorMessage: null },
      create: { campaignId: id, contactId: contact.id, status: "PENDING" },
    });

    const personalizationContext: PersonalizationContext = {
      first_name: contact.firstName,
      last_name: contact.lastName,
      company: contact.company,
      product_interest: contact.productInterest,
    };

    try {
      let providerMessageId: string;

      if (existing.channel === "EMAIL") {
        const subject = renderPersonalization(existing.subject ?? "", personalizationContext);
        const html = renderEmailHtml({
          message: renderPersonalization(existing.message, personalizationContext),
          imageUrl: existing.imageUrl,
          imagePosition: existing.imagePosition,
          ctaLabel: existing.ctaLabel,
          // Routed through the click-tracking redirect (which looks up the real destination
          // server-side) rather than the raw campaign CTA URL, so a real click can be attributed
          // to this specific recipient.
          ctaUrl: existing.ctaUrl ? buildClickUrl(campaignRecipient.id) : existing.ctaUrl,
          unsubscribeUrl: buildUnsubscribeUrl(contact.id, "EMAIL"),
          trackingPixelUrl: buildOpenPixelUrl(campaignRecipient.id),
        });
        const result = await sendEmailViaGmail({ to: contact.email!, subject, html });
        providerMessageId = result.providerMessageId;
      } else if (existing.channel === "WHATSAPP") {
        const bodyParams = whatsappBodyVariables.map(
          (name) => personalizationContext[name as keyof PersonalizationContext] ?? "",
        );
        const result = await sendWhatsAppTemplateMessage({
          to: contact.whatsappNumber!,
          templateName: existing.whatsappTemplateName!,
          templateLanguage: existing.whatsappTemplateLanguage ?? "en",
          bodyParams,
        });
        providerMessageId = result.providerMessageId;
      } else {
        const result = await sendViberMessage({
          receiverId: contact.viberUserId!,
          text: renderPersonalization(existing.message, personalizationContext),
          ctaLabel: existing.ctaLabel,
          ctaUrl: existing.ctaUrl ? buildClickUrl(campaignRecipient.id) : existing.ctaUrl,
        });
        providerMessageId = result.providerMessageId;
      }

      await prisma.$transaction([
        prisma.campaignRecipient.update({
          where: { id: campaignRecipient.id },
          data: { status: "SENT", sentAt: new Date() },
        }),
        prisma.campaignMessage.create({
          data: {
            campaignRecipientId: campaignRecipient.id,
            channel: existing.channel,
            providerMessageId,
            rawStatus: "sent",
          },
        }),
      ]);
      sentCount += 1;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown send error";
      const lowerErrorMessage = errorMessage.toLowerCase();
      const isDailyLimitError = lowerErrorMessage.includes("daily") && lowerErrorMessage.includes("limit reached");
      // Gmail's own per-user rate limit (separate from our tracked daily counter — see
      // gmailSend.service.ts's isRateLimitError) — a real provider-side throttle with a ~15-minute
      // cooldown. Every recipient after the first one to hit it would fail identically, so this
      // must stop the batch the same way the daily limit does, not burn through the rest of the
      // list generating the same guaranteed rejection.
      const isProviderThrottled = isDailyLimitError || lowerErrorMessage.includes("rate limit");

      if (isProviderThrottled) {
        // Not a real failure for this recipient — nothing was actually attempted against the
        // provider. Leave them PENDING (already upserted above) so the next batch/day picks them
        // up automatically instead of permanently recording a failure that was never theirs.
        const detailMatch = errorMessage.match(/\[(.*?)\]/);
        const detailSuffix = detailMatch ? ` (${detailMatch[1]})` : "";
        const unlockMatch = errorMessage.match(/\{unlock:(.*?)\}/);
        throttledUntil = unlockMatch ? unlockMatch[1] : undefined;

        throttledReason = isDailyLimitError
          ? `Stopped: today's daily sending limit has been reached. It resets at UTC midnight — try "Send next batch" again after that.`
          : `Stopped: Gmail's short-term rate limit was reached (a separate, shorter-window limit from the daily one)${detailSuffix}. Retrying immediately resets Google's cooldown — please wait before clicking "Send next batch" again.`;
        break;
      }

      await prisma.$transaction([
        prisma.campaignRecipient.update({
          where: { id: campaignRecipient.id },
          data: { status: "FAILED", errorMessage },
        }),
        prisma.campaignMessage.create({
          data: {
            campaignRecipientId: campaignRecipient.id,
            channel: existing.channel,
            rawStatus: "failed",
            errorMessage,
          },
        }),
      ]);
      failedCount += 1;
    }

    await sleep(SEND_DELAY_MS);
  }

  // Recomputed with the exact same query used to pick recipients in the first place (and the one
  // getCampaign uses independently for the UI) — a never-attempted-yet contact (batchSize cutoff)
  // or one left PENDING by a daily-limit break both still count; a genuinely FAILED one doesn't.
  const remainingCount = await prisma.contact.count({ where });
  // Cumulative across every batch this campaign has ever run, not just this call — a later batch
  // finishing off a large audience must still resolve to SENT if earlier batches already
  // succeeded, even if this particular call's own sentCount is 0.
  const totalSentSoFar = await prisma.campaignRecipient.count({ where: { campaignId: id, status: "SENT" } });
  const finalStatus: CampaignStatus = remainingCount > 0 ? "SENDING" : totalSentSoFar > 0 ? "SENT" : "FAILED";

  await prisma.campaign.update({
    where: { id },
    data: finalStatus === "SENT" ? { status: finalStatus, sentAt: new Date() } : { status: finalStatus },
  });
  await recordAudit({
    userId: actorId,
    action: "CAMPAIGN_SENT",
    entityType: "Campaign",
    entityId: id,
    metadata: { sentCount, failedCount, remainingCount, throttledReason, throttledUntil },
  });

  return { sentCount, failedCount, remainingCount, throttledReason, throttledUntil };
}
