import type { Channel } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";
import { extractUsedVariables } from "../config/personalization.js";
import type { TemplateCategory } from "../config/templateCategories.js";

interface TemplateInput {
  name: string;
  category: TemplateCategory;
  channel: Channel;
  subject?: string | null;
  body: string;
  imageUrl?: string | null;
  imagePosition?: "TOP" | "BOTTOM";
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export function listTemplates(filters: { category?: TemplateCategory; channel?: Channel }) {
  return prisma.template.findMany({
    where: {
      category: filters.category,
      channel: filters.channel,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplate(id: string) {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new AppError(404, "Template not found");
  return template;
}

export async function createTemplate(input: TemplateInput, actorId: string) {
  const variables = extractUsedVariables(input.subject, input.body);
  const template = await prisma.template.create({
    data: {
      name: input.name,
      category: input.category,
      channel: input.channel,
      subject: input.channel === "EMAIL" ? input.subject || null : null,
      body: input.body,
      imageUrl: input.imageUrl || null,
      imagePosition: input.imagePosition || "TOP",
      ctaLabel: input.ctaLabel || null,
      ctaUrl: input.ctaUrl || null,
      variables,
      createdById: actorId,
    },
  });
  await recordAudit({ userId: actorId, action: "TEMPLATE_CREATED", entityType: "Template", entityId: template.id });
  return template;
}

export async function updateTemplate(id: string, input: Partial<TemplateInput>, actorId: string) {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Template not found");

  const nextChannel = input.channel ?? existing.channel;
  const nextSubject = input.subject !== undefined ? input.subject : existing.subject;
  const nextBody = input.body ?? existing.body;
  const variables = extractUsedVariables(nextSubject, nextBody);

  const template = await prisma.template.update({
    where: { id },
    data: {
      name: input.name,
      category: input.category,
      channel: input.channel,
      subject: nextChannel === "EMAIL" ? nextSubject || null : null,
      body: input.body,
      imageUrl: input.imageUrl === undefined ? undefined : input.imageUrl || null,
      imagePosition: input.imagePosition,
      ctaLabel: input.ctaLabel === undefined ? undefined : input.ctaLabel || null,
      ctaUrl: input.ctaUrl === undefined ? undefined : input.ctaUrl || null,
      variables,
    },
  });
  await recordAudit({ userId: actorId, action: "TEMPLATE_UPDATED", entityType: "Template", entityId: id });
  return template;
}

export async function deleteTemplate(id: string, actorId: string) {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Template not found");
  await prisma.template.delete({ where: { id } });
  await recordAudit({
    userId: actorId,
    action: "TEMPLATE_DELETED",
    entityType: "Template",
    entityId: id,
    metadata: { name: existing.name },
  });
}
