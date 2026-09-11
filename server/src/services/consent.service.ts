import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";
import type { ConsentChannel } from "@prisma/client";

interface SetConsentInput {
  contactId: string;
  channel: ConsentChannel;
  optIn: boolean;
  consentSource?: string | null;
  // Null for self-service actions with no authenticated app user, e.g. a contact clicking their
  // own unsubscribe link.
  actorId: string | null;
}

// Consent history is append-only (see COMPLIANCE.md) — every change writes a new row rather than
// mutating a prior one. Opting out immediately adds the contact to the channel's suppression
// list; opting back in removes them. This is enforced here, not left to the caller.
export async function setConsent(input: SetConsentInput) {
  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact) {
    throw new AppError(404, "Contact not found");
  }

  const consent = await prisma.consent.create({
    data: {
      contactId: input.contactId,
      channel: input.channel,
      optIn: input.optIn,
      consentSource: input.consentSource ?? null,
      optOutDate: input.optIn ? null : new Date(),
    },
  });

  if (input.optIn) {
    await prisma.suppressionList.deleteMany({
      where: { contactId: input.contactId, channel: input.channel },
    });
  } else {
    await prisma.suppressionList.upsert({
      where: { contactId_channel: { contactId: input.contactId, channel: input.channel } },
      update: { reason: "Contact opted out" },
      create: {
        contactId: input.contactId,
        channel: input.channel,
        reason: "Contact opted out",
      },
    });
  }

  await recordAudit({
    userId: input.actorId,
    action: input.optIn ? "CONSENT_OPT_IN" : "CONSENT_OPT_OUT",
    entityType: "Contact",
    entityId: input.contactId,
    metadata: { channel: input.channel, consentSource: input.consentSource },
  });

  return consent;
}

export function getConsentHistory(contactId: string) {
  return prisma.consent.findMany({ where: { contactId }, orderBy: { consentDate: "desc" } });
}

export function listSuppressed(channel?: ConsentChannel) {
  return prisma.suppressionList.findMany({
    where: channel ? { channel } : undefined,
    include: { contact: true },
    orderBy: { addedAt: "desc" },
  });
}
