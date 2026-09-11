import { Prisma, type ConsentChannel } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";
import { SEGMENT_FIELD_KIND } from "../config/segmentFields.js";
import type { SegmentCondition, SegmentRules } from "../schemas/segment.schema.js";

const CONSENT_FIELD_CHANNEL: Record<string, ConsentChannel> = {
  consent_email: "EMAIL",
  consent_whatsapp: "WHATSAPP",
  consent_viber: "VIBER",
};

const TEXT_FIELD_COLUMN: Record<string, "productInterest" | "location" | "company"> = {
  productInterest: "productInterest",
  location: "location",
  company: "company",
};

const SELECT_FIELD_COLUMN: Record<string, "customerType" | "leadStatus" | "leadSource"> = {
  customerType: "customerType",
  leadStatus: "leadStatus",
  leadSource: "leadSource",
};

function buildConditionWhere(condition: SegmentCondition): Prisma.ContactWhereInput {
  const kind = SEGMENT_FIELD_KIND[condition.field];

  if (kind === "text") {
    const column = TEXT_FIELD_COLUMN[condition.field];
    if (condition.operator === "contains") {
      return { [column]: { contains: condition.value, mode: "insensitive" } };
    }
    if (condition.operator === "equals") {
      return { [column]: { equals: condition.value, mode: "insensitive" } };
    }
    // not_equals
    return { NOT: { [column]: { equals: condition.value, mode: "insensitive" } } };
  }

  if (kind === "select") {
    const column = SELECT_FIELD_COLUMN[condition.field];
    if (condition.operator === "equals") {
      return { [column]: condition.value };
    }
    return { NOT: { [column]: condition.value } };
  }

  if (kind === "tag") {
    if (condition.operator === "has") {
      return { tags: { some: { tag: { name: condition.value } } } };
    }
    return { tags: { none: { tag: { name: condition.value } } } };
  }

  // consent
  const channel = CONSENT_FIELD_CHANNEL[condition.field];
  if (condition.value === "opted_in") {
    return {
      consents: { some: { channel, optIn: true } },
      suppressions: { none: { channel } },
    };
  }
  if (condition.value === "opted_out") {
    return { suppressions: { some: { channel } } };
  }
  // no_record
  return { consents: { none: { channel } } };
}

function buildGroupWhere(group: SegmentRules["groups"][number]): Prisma.ContactWhereInput {
  return { AND: group.conditions.map(buildConditionWhere) };
}

export function buildRulesWhere(rules: SegmentRules): Prisma.ContactWhereInput {
  return { OR: rules.groups.map(buildGroupWhere) };
}

export function countMatching(rules: SegmentRules) {
  return prisma.contact.count({ where: buildRulesWhere(rules) });
}

export async function previewMatching(rules: SegmentRules, page: number, pageSize: number) {
  const where = buildRulesWhere(rules);
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { tags: { include: { tag: true } } },
    }),
    prisma.contact.count({ where }),
  ]);
  return { contacts, total, page, pageSize };
}

interface SegmentInput {
  name: string;
  description?: string | null;
  rules: SegmentRules;
}

export function listSegments() {
  return prisma.segment.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function getSegment(id: string) {
  const segment = await prisma.segment.findUnique({ where: { id } });
  if (!segment) throw new AppError(404, "Segment not found");
  return segment;
}

export async function createSegment(input: SegmentInput, actorId: string) {
  const segment = await prisma.segment.create({
    data: {
      name: input.name,
      description: input.description || null,
      rulesJson: input.rules as unknown as Prisma.InputJsonValue,
      createdById: actorId,
    },
  });
  await recordAudit({ userId: actorId, action: "SEGMENT_CREATED", entityType: "Segment", entityId: segment.id });
  return segment;
}

export async function updateSegment(id: string, input: Partial<SegmentInput>, actorId: string) {
  const existing = await prisma.segment.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Segment not found");

  const segment = await prisma.segment.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description === undefined ? undefined : input.description || null,
      rulesJson: input.rules ? (input.rules as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
  await recordAudit({ userId: actorId, action: "SEGMENT_UPDATED", entityType: "Segment", entityId: id });
  return segment;
}

export async function deleteSegment(id: string, actorId: string) {
  const existing = await prisma.segment.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Segment not found");
  await prisma.segment.delete({ where: { id } });
  await recordAudit({
    userId: actorId,
    action: "SEGMENT_DELETED",
    entityType: "Segment",
    entityId: id,
    metadata: { name: existing.name },
  });
}
