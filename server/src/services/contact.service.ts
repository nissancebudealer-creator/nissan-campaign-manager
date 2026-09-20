import crypto from "node:crypto";
import { Prisma, type ConsentChannel } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";
import { evaluateNewContactTrigger, evaluateLeadStatusTrigger } from "./automation.service.js";
import { checkEmailDomains, checkMxRecord, domainOf, suggestDomainCorrection } from "../lib/emailDomainValidation.js";
import type { validateImportRow } from "../schemas/contact.schema.js";

// Every new contact is opted in on all channels by default (business decision — the app no
// longer requires an explicit consent-capture step before a contact becomes deliverable). Real
// Consent rows are still written (not a bypass of the deliverability check itself) so the audit
// trail, per-channel opt-out, and suppression list all keep working exactly as before.
const DEFAULT_CONSENT_CHANNELS: ConsentChannel[] = ["EMAIL", "WHATSAPP", "VIBER"];

interface ContactInput {
  firstName: string;
  lastName: string;
  company?: string | null;
  email?: string | null;
  mobileNumber?: string | null;
  whatsappNumber?: string | null;
  viberNumber?: string | null;
  customerType?: string | null;
  productInterest?: string | null;
  location?: string | null;
  leadSource?: string | null;
  leadStatus?: string | null;
  notes?: string | null;
  tagIds?: string[];
}

interface ListParams {
  search?: string;
  customerType?: string;
  leadStatus?: string;
  tagId?: string;
  page: number;
  pageSize: number;
}

const contactInclude = {
  tags: { include: { tag: true } },
  consents: { orderBy: { consentDate: "desc" as const } },
  suppressions: true,
};

function normalizeEmail(email?: string | null) {
  return email ? email.trim().toLowerCase() : null;
}

export async function listContacts(params: ListParams) {
  const { search, customerType, leadStatus, tagId, page, pageSize } = params;

  const where: Prisma.ContactWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { company: { contains: search, mode: "insensitive" } },
              { mobileNumber: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      customerType ? { customerType } : {},
      leadStatus ? { leadStatus } : {},
      tagId ? { tags: { some: { tagId } } } : {},
    ],
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: contactInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return { contacts, total, page, pageSize };
}

export async function listAllContactsForExport(params: Omit<ListParams, "page" | "pageSize">) {
  const { contacts } = await listContacts({ ...params, page: 1, pageSize: 10000 });
  return contacts;
}

export function getContact(id: string) {
  return prisma.contact.findUnique({ where: { id }, include: contactInclude }).then((contact) => {
    if (!contact) throw new AppError(404, "Contact not found");
    return contact;
  });
}

async function assertNoDuplicateEmail(email: string | null, excludeId?: string) {
  if (!email) return;
  const existing = await prisma.contact.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, NOT: excludeId ? { id: excludeId } : undefined },
  });
  if (existing) {
    throw new AppError(409, `A contact with email ${email} already exists`);
  }
}

// Real DNS check (see emailDomainValidation.ts), not a hard gate on manual entry — a human already
// deliberately chose to add this specific contact, so this only computes and stores the result for
// the campaign send filter to act on later, rather than blocking on a single slow DNS lookup or an
// address that's genuinely fine for other channels (WhatsApp/Viber) even if email bounces.
async function computeEmailDomainValid(email: string | null): Promise<boolean | null> {
  if (!email) return null;
  const result = await checkMxRecord(domainOf(email));
  return result === "unknown" ? null : result === "valid";
}

export async function createContact(input: ContactInput, createdById: string) {
  const email = normalizeEmail(input.email);
  await assertNoDuplicateEmail(email);
  const emailDomainValid = await computeEmailDomainValid(email);

  const contact = await prisma.contact.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.company || null,
      email,
      emailDomainValid,
      mobileNumber: input.mobileNumber || null,
      whatsappNumber: input.whatsappNumber || null,
      viberNumber: input.viberNumber || null,
      customerType: input.customerType || null,
      productInterest: input.productInterest || null,
      location: input.location || null,
      leadSource: input.leadSource || null,
      leadStatus: input.leadStatus || null,
      notes: input.notes || null,
      createdById,
      tags: input.tagIds?.length
        ? { create: input.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: contactInclude,
  });

  // A single batched insert rather than looping setConsent per channel — this is a brand new
  // contact, so there's no prior suppression to clean up and no need to re-check it exists.
  await prisma.consent.createMany({
    data: DEFAULT_CONSENT_CHANNELS.map((channel) => ({
      contactId: contact.id,
      channel,
      optIn: true,
      consentSource: "Default opt-in on creation",
    })),
  });

  await recordAudit({
    userId: createdById,
    action: "CONTACT_CREATED",
    entityType: "Contact",
    entityId: contact.id,
    metadata: { defaultOptInChannels: DEFAULT_CONSENT_CHANNELS },
  });

  await evaluateNewContactTrigger(contact);

  return contact;
}

export async function updateContact(id: string, input: Partial<ContactInput>, actorId: string) {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "Contact not found");
  }

  const email = input.email !== undefined ? normalizeEmail(input.email) : undefined;
  // Only recomputed when the email is actually changing — leaving it alone otherwise preserves
  // whatever was already established (including a prior real check's result).
  const emailDomainValid = email !== undefined ? await computeEmailDomainValid(email) : undefined;
  if (email !== undefined) {
    await assertNoDuplicateEmail(email, id);
  }

  if (input.tagIds !== undefined) {
    await prisma.contactTag.deleteMany({ where: { contactId: id } });
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.company === undefined ? undefined : input.company || null,
      email,
      emailDomainValid,
      mobileNumber: input.mobileNumber === undefined ? undefined : input.mobileNumber || null,
      whatsappNumber: input.whatsappNumber === undefined ? undefined : input.whatsappNumber || null,
      viberNumber: input.viberNumber === undefined ? undefined : input.viberNumber || null,
      customerType: input.customerType === undefined ? undefined : input.customerType || null,
      productInterest: input.productInterest === undefined ? undefined : input.productInterest || null,
      location: input.location === undefined ? undefined : input.location || null,
      leadSource: input.leadSource === undefined ? undefined : input.leadSource || null,
      leadStatus: input.leadStatus === undefined ? undefined : input.leadStatus || null,
      notes: input.notes === undefined ? undefined : input.notes || null,
      tags: input.tagIds ? { create: input.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    include: contactInclude,
  });

  await recordAudit({
    userId: actorId,
    action: "CONTACT_UPDATED",
    entityType: "Contact",
    entityId: id,
  });

  await evaluateLeadStatusTrigger(contact, existing.leadStatus);

  return contact;
}

export async function deleteContact(id: string, actorId: string) {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "Contact not found");
  }
  await prisma.contact.delete({ where: { id } });
  await recordAudit({
    userId: actorId,
    action: "CONTACT_DELETED",
    entityType: "Contact",
    entityId: id,
    metadata: { email: existing.email, firstName: existing.firstName, lastName: existing.lastName },
  });
}

interface BulkUpdateInput {
  contactIds: string[];
  addTagIds?: string[];
  removeTagIds?: string[];
  leadStatus?: string;
}

export async function bulkUpdateContacts(input: BulkUpdateInput, actorId: string) {
  const { contactIds, addTagIds, removeTagIds, leadStatus } = input;

  if (leadStatus) {
    // Fetched before the bulk update so each contact's real previous status is known — bulk
    // lead-status changes must fire LEAD_STATUS_CHANGED automations exactly like a single-contact
    // edit does, not silently bypass them via updateMany.
    const before = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, leadStatus: true },
    });
    await prisma.contact.updateMany({ where: { id: { in: contactIds } }, data: { leadStatus } });
    const updated = await prisma.contact.findMany({ where: { id: { in: contactIds } } });
    const previousById = new Map(before.map((c) => [c.id, c.leadStatus]));
    for (const contact of updated) {
      await evaluateLeadStatusTrigger(contact, previousById.get(contact.id) ?? null);
    }
  }

  if (addTagIds?.length) {
    for (const contactId of contactIds) {
      for (const tagId of addTagIds) {
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId, tagId } },
          update: {},
          create: { contactId, tagId },
        });
      }
    }
  }

  if (removeTagIds?.length) {
    await prisma.contactTag.deleteMany({
      where: { contactId: { in: contactIds }, tagId: { in: removeTagIds } },
    });
  }

  await recordAudit({
    userId: actorId,
    action: "CONTACT_BULK_UPDATED",
    entityType: "Contact",
    metadata: { contactIds, addTagIds, removeTagIds, leadStatus },
  });

  return { updated: contactIds.length };
}

// ---------- CSV Import ----------

interface ImportRowResult {
  rowNumber: number;
  data: Record<string, string>;
  status: "valid" | "duplicate" | "invalid";
  errors?: string[];
}

export async function validateImportRows(
  rows: Record<string, string>[],
  validator: typeof validateImportRow,
) {
  const results: ImportRowResult[] = [];
  const seenEmails = new Set<string>();
  // Rows that pass every synchronous check and carry an email — held back from a final "valid"
  // verdict until the batched real DNS check below confirms the domain can actually receive mail.
  const pendingDomainCheck: { result: ImportRowResult; email: string }[] = [];

  const existingEmails = new Set(
    (
      await prisma.contact.findMany({
        where: { email: { not: null } },
        select: { email: true },
      })
    ).map((c) => (c.email ?? "").toLowerCase()),
  );

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // account for header row, 1-indexed
    const parsed = validator(raw);

    if (!parsed.success) {
      results.push({
        rowNumber,
        data: raw,
        status: "invalid",
        errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      return;
    }

    const email = parsed.data.email ? parsed.data.email.toLowerCase() : null;

    if (email && (existingEmails.has(email) || seenEmails.has(email))) {
      results.push({ rowNumber, data: raw, status: "duplicate", errors: ["Email already exists"] });
      return;
    }

    if (email) seenEmails.add(email);
    const result: ImportRowResult = { rowNumber, data: raw, status: "valid" };
    results.push(result);
    if (email) pendingDomainCheck.push({ result, email });
  });

  // Batched by distinct domain (see emailDomainValidation.ts), so a large import with many rows
  // sharing a handful of real providers costs only a handful of real DNS lookups, not one per row.
  const domainResults = await checkEmailDomains(pendingDomainCheck.map((p) => p.email));
  for (const { result, email } of pendingDomainCheck) {
    const domain = domainOf(email);
    if (domainResults.get(domain) === "invalid") {
      result.status = "invalid";
      const suggestion = suggestDomainCorrection(domain);
      result.errors = [
        `email: "${domain}" has no mail server and can't receive email` +
          (suggestion ? ` — did you mean "${suggestion}"?` : ""),
      ];
    }
  }

  return results;
}

export async function commitImport(rows: Record<string, string>[], createdById: string) {
  const existingEmails = new Set(
    (
      await prisma.contact.findMany({
        where: { email: { not: null } },
        select: { email: true },
      })
    ).map((c) => (c.email ?? "").toLowerCase()),
  );

  const seenEmails = new Set<string>();
  const toCreate: Prisma.ContactCreateManyInput[] = [];

  // Batched once for every row here (not per row) — same reasoning as validateImportRows. Rows
  // reaching commit should already have been filtered to "valid" by the preview step, but this is
  // computed fresh rather than trusted from an earlier, possibly-stale preview call.
  const domainResults = await checkEmailDomains(rows.map((r) => r.email));

  for (const row of rows) {
    const email = row.email ? row.email.trim().toLowerCase() : null;
    if (email) {
      if (existingEmails.has(email) || seenEmails.has(email)) continue;
      seenEmails.add(email);
    }
    const domainResult = email ? domainResults.get(domainOf(email)) : undefined;

    toCreate.push({
      // Generated up front (rather than left to Prisma's own cuid() default) so the id is known
      // here for the batched Consent insert below, without a second round-trip to look rows back up.
      id: crypto.randomUUID(),
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      company: row.company?.trim() || null,
      email,
      emailDomainValid: domainResult === undefined || domainResult === "unknown" ? null : domainResult === "valid",
      mobileNumber: row.mobileNumber?.trim() || null,
      whatsappNumber: row.whatsappNumber?.trim() || null,
      viberNumber: row.viberNumber?.trim() || null,
      customerType: row.customerType?.trim() || null,
      productInterest: row.productInterest?.trim() || null,
      location: row.location?.trim() || null,
      leadSource: row.leadSource?.trim() || "CSV Import",
      leadStatus: row.leadStatus?.trim() || null,
      notes: row.notes?.trim() || null,
      createdById,
    });
  }

  const created = toCreate.length === 0 ? 0 : (await prisma.contact.createMany({ data: toCreate })).count;

  if (toCreate.length > 0) {
    await prisma.consent.createMany({
      data: toCreate.flatMap((c) =>
        DEFAULT_CONSENT_CHANNELS.map((channel) => ({
          contactId: c.id!,
          channel,
          optIn: true,
          consentSource: "CSV import (default opt-in)",
        })),
      ),
    });
  }

  await recordAudit({
    userId: createdById,
    action: "CONTACT_IMPORTED",
    entityType: "Contact",
    metadata: { count: created },
  });

  return { created };
}
