import type { AutomationTriggerType, Channel, Contact } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";
import { deliverableWhere, channelAddressWhere } from "./campaign.service.js";
import { renderPersonalization, extractUsedVariables, type PersonalizationContext } from "../config/personalization.js";
import { renderEmailHtml } from "../lib/renderEmailHtml.js";
import { buildUnsubscribeUrl } from "./unsubscribe.service.js";
import { sendEmailViaGmail } from "./gmailSend.service.js";
import { sendWhatsAppTemplateMessage } from "./whatsapp.service.js";
import { sendViberMessage } from "./viber.service.js";
import { SEND_DELAY_MS } from "../config/gmailLimits.js";
import type { AutomationStep } from "../config/automationTriggers.js";
import { logger } from "../utils/logger.js";

const RETRY_COOLDOWN_MS = 60 * 60 * 1000; // on a provider-side failure (e.g. daily limit), wait
// an hour before re-attempting the same step rather than retrying every 5-minute runner tick.

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysFromNow(days: number, from: Date): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function getSteps(stepsJson: unknown): AutomationStep[] {
  return stepsJson as AutomationStep[];
}

const ruleInclude = { createdBy: { select: { firstName: true, lastName: true } } };

export function listAutomationRules() {
  return prisma.automationRule.findMany({ include: ruleInclude, orderBy: { createdAt: "desc" } });
}

export async function getAutomationRule(id: string) {
  const rule = await prisma.automationRule.findUnique({ where: { id }, include: ruleInclude });
  if (!rule) throw new AppError(404, "Automation rule not found");
  return rule;
}

interface RuleInput {
  name: string;
  triggerType: AutomationTriggerType;
  triggerValue?: string | null;
  steps: AutomationStep[];
  isActive?: boolean;
}

export async function createAutomationRule(input: RuleInput, actorId: string) {
  const rule = await prisma.automationRule.create({
    data: {
      name: input.name,
      triggerType: input.triggerType,
      triggerValue: input.triggerType === "LEAD_STATUS_CHANGED" ? input.triggerValue : null,
      stepsJson: input.steps as object[],
      isActive: input.isActive ?? false,
      createdById: actorId,
    },
    include: ruleInclude,
  });
  await recordAudit({ userId: actorId, action: "AUTOMATION_CREATED", entityType: "AutomationRule", entityId: rule.id });
  return rule;
}

export async function updateAutomationRule(id: string, input: Partial<RuleInput>, actorId: string) {
  const existing = await prisma.automationRule.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Automation rule not found");

  const nextTriggerType = input.triggerType ?? existing.triggerType;
  const rule = await prisma.automationRule.update({
    where: { id },
    data: {
      name: input.name,
      triggerType: input.triggerType,
      triggerValue: nextTriggerType === "LEAD_STATUS_CHANGED" ? input.triggerValue ?? existing.triggerValue : null,
      stepsJson: input.steps ? (input.steps as object[]) : undefined,
      isActive: input.isActive,
    },
    include: ruleInclude,
  });
  await recordAudit({ userId: actorId, action: "AUTOMATION_UPDATED", entityType: "AutomationRule", entityId: id });
  return rule;
}

export async function deleteAutomationRule(id: string, actorId: string) {
  const existing = await prisma.automationRule.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Automation rule not found");
  if (existing.isActive) {
    throw new AppError(409, "Deactivate this automation before deleting it — active enrollments would lose their history otherwise.");
  }
  await prisma.automationRule.delete({ where: { id } });
  await recordAudit({
    userId: actorId,
    action: "AUTOMATION_DELETED",
    entityType: "AutomationRule",
    entityId: id,
    metadata: { name: existing.name },
  });
}

export function listEnrollments(automationRuleId: string) {
  return prisma.automationEnrollment.findMany({
    where: { automationRuleId },
    include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { enrolledAt: "desc" },
  });
}

// Exported for a direct regression test of the P2003 handling below (see admin/automation test
// suite) — not part of the public HTTP API, callers elsewhere in this file use it internally.
export async function createEnrollment(automationRuleId: string, contactId: string, steps: AutomationStep[]) {
  const enrolledAt = new Date();
  try {
    return await prisma.automationEnrollment.create({
      data: {
        automationRuleId,
        contactId,
        enrolledAt,
        nextStepDueAt: daysFromNow(steps[0].dayOffset, enrolledAt),
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // P2002: unique [automationRuleId, contactId] — this contact is already enrolled (or was, and
    // completed/cancelled). Never re-enroll silently-duplicated; the caller decides how to react.
    if (code === "P2002") return null;
    // P2003: the rule was deleted between evaluateNewContactTrigger/evaluateLeadStatusTrigger's
    // read and this write — a real, if narrow, race (an admin deleting a rule at the same moment
    // a contact is created elsewhere), not just a test artifact. A contact's creation/update must
    // never fail because of an unrelated concurrent action on an automation rule — skip this one
    // enrollment attempt exactly like a duplicate, rather than letting it bubble up and break the
    // contact write itself.
    if (code === "P2003") return null;
    throw err;
  }
}

// ---------- Manual enrollment ----------

export async function enrollContact(automationRuleId: string, contactId: string, actorId: string) {
  const rule = await prisma.automationRule.findUnique({ where: { id: automationRuleId } });
  if (!rule) throw new AppError(404, "Automation rule not found");
  if (!rule.isActive) throw new AppError(409, "This automation is not active.");
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new AppError(404, "Contact not found");

  const steps = getSteps(rule.stepsJson);
  const enrollment = await createEnrollment(automationRuleId, contactId, steps);
  if (!enrollment) throw new AppError(409, "This contact is already enrolled in this automation.");

  await recordAudit({
    userId: actorId,
    action: "AUTOMATION_ENROLLED",
    entityType: "AutomationEnrollment",
    entityId: enrollment.id,
    metadata: { automationRuleId, contactId, trigger: "MANUAL" },
  });
  return enrollment;
}

export async function cancelEnrollment(enrollmentId: string, actorId: string) {
  const enrollment = await prisma.automationEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new AppError(404, "Enrollment not found");
  if (enrollment.status !== "ACTIVE") throw new AppError(409, `Enrollment is already ${enrollment.status.toLowerCase()}`);
  const updated = await prisma.automationEnrollment.update({
    where: { id: enrollmentId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await recordAudit({ userId: actorId, action: "AUTOMATION_ENROLLMENT_CANCELLED", entityType: "AutomationEnrollment", entityId: enrollmentId });
  return updated;
}

// ---------- Automatic triggers — called from contact.service.ts ----------
// One-directional dependency: contact.service.ts calls into here, this file never imports
// contact.service.ts, so there's no circularity.

export async function evaluateNewContactTrigger(contact: Contact) {
  const rules = await prisma.automationRule.findMany({ where: { triggerType: "NEW_CONTACT", isActive: true } });
  for (const rule of rules) {
    await createEnrollment(rule.id, contact.id, getSteps(rule.stepsJson));
  }
}

export async function evaluateLeadStatusTrigger(contact: Contact, previousLeadStatus: string | null) {
  if (!contact.leadStatus || contact.leadStatus === previousLeadStatus) return; // only fire on an actual transition
  const rules = await prisma.automationRule.findMany({
    where: { triggerType: "LEAD_STATUS_CHANGED", isActive: true, triggerValue: contact.leadStatus },
  });
  for (const rule of rules) {
    await createEnrollment(rule.id, contact.id, getSteps(rule.stepsJson));
  }
}

// ---------- The runner ----------
// No background job queue (see ARCHITECTURE.md) — called on an in-process interval from index.ts,
// and exposed via POST /api/automation/run-now for an external free-tier cron pinger to hit when
// the server has scaled to zero. Reuses the exact same provider adapters and consent/address
// checks as a real campaign send — automation is not a separate, weaker send path.
export async function runDueSteps(): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  const due = await prisma.automationEnrollment.findMany({
    where: { status: "ACTIVE", nextStepDueAt: { lte: new Date() } },
    include: { contact: true, automationRule: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const enrollment of due) {
    const steps = getSteps(enrollment.automationRule.stepsJson);
    const step = steps[enrollment.currentStepIndex];
    if (!step) {
      // Defensive — shouldn't happen, but a rule edited to have fewer steps than an in-flight
      // enrollment's currentStepIndex must not leave the enrollment stuck forever.
      await prisma.automationEnrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      continue;
    }

    const contact = enrollment.contact;
    const deliverable = await prisma.contact.findFirst({
      where: { id: contact.id, AND: [deliverableWhere(step.channel), channelAddressWhere(step.channel)] },
    });

    if (!deliverable) {
      await logStep(enrollment.id, enrollment.currentStepIndex, step.channel, "SKIPPED", null,
        "Contact no longer has a recorded opt-in or a deliverable address for this channel — skipped, not sent.");
      skipped += 1;
      await advanceOrComplete(enrollment.id, enrollment.currentStepIndex, steps, enrollment.enrolledAt);
      continue;
    }

    const personalizationContext: PersonalizationContext = {
      first_name: contact.firstName,
      last_name: contact.lastName,
      company: contact.company,
      product_interest: contact.productInterest,
    };

    try {
      const providerMessageId = await sendStep(step, contact, personalizationContext);
      await logStep(enrollment.id, enrollment.currentStepIndex, step.channel, "SENT", providerMessageId, null);
      sent += 1;
      await advanceOrComplete(enrollment.id, enrollment.currentStepIndex, steps, enrollment.enrolledAt);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown send error";
      await logStep(enrollment.id, enrollment.currentStepIndex, step.channel, "FAILED", null, errorMessage);
      failed += 1;
      // A real provider failure (e.g. daily limit) — retry the same step later rather than
      // silently skipping ahead, since this contact never actually received it.
      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: { nextStepDueAt: new Date(Date.now() + RETRY_COOLDOWN_MS) },
      });
      logger.warn("Automation step failed", { enrollmentId: enrollment.id, stepIndex: enrollment.currentStepIndex, errorMessage });
    }

    await sleep(SEND_DELAY_MS);
  }

  return { processed: due.length, sent, failed, skipped };
}

async function sendStep(step: AutomationStep, contact: Contact, personalizationContext: PersonalizationContext): Promise<string> {
  const template = await prisma.template.findUnique({ where: { id: step.templateId } });
  if (!template) throw new Error(`Step references a deleted template (${step.templateId})`);

  if (step.channel === "EMAIL") {
    if (!contact.email) throw new Error("Contact has no email address"); // deliverability re-check already covers this, defensive only
    const subject = renderPersonalization(template.subject ?? "", personalizationContext);
    const html = renderEmailHtml({
      message: renderPersonalization(template.body, personalizationContext),
      imageUrl: template.imageUrl,
      imagePosition: template.imagePosition,
      ctaLabel: template.ctaLabel,
      ctaUrl: template.ctaUrl,
      unsubscribeUrl: buildUnsubscribeUrl(contact.id, "EMAIL"),
    });
    const result = await sendEmailViaGmail({ to: contact.email, subject, html });
    return result.providerMessageId;
  }

  if (step.channel === "WHATSAPP") {
    if (!contact.whatsappNumber) throw new Error("Contact has no WhatsApp number");
    if (!step.whatsappTemplateName) throw new Error("Step has no WhatsApp template configured");
    const bodyVariables = extractUsedVariables(template.body);
    const bodyParams = bodyVariables.map((name) => personalizationContext[name as keyof PersonalizationContext] ?? "");
    const result = await sendWhatsAppTemplateMessage({
      to: contact.whatsappNumber,
      templateName: step.whatsappTemplateName,
      templateLanguage: step.whatsappTemplateLanguage ?? "en",
      bodyParams,
    });
    return result.providerMessageId;
  }

  // VIBER
  if (!contact.viberUserId) throw new Error("Contact has not subscribed on Viber");
  const result = await sendViberMessage({
    receiverId: contact.viberUserId,
    text: renderPersonalization(template.body, personalizationContext),
    ctaLabel: template.ctaLabel,
    ctaUrl: template.ctaUrl,
  });
  return result.providerMessageId;
}

function logStep(
  enrollmentId: string,
  stepIndex: number,
  channel: Channel,
  status: "SENT" | "FAILED" | "SKIPPED",
  providerMessageId: string | null,
  errorMessage: string | null,
) {
  return prisma.automationStepLog.create({
    data: { enrollmentId, stepIndex, channel, status, providerMessageId, errorMessage },
  });
}

async function advanceOrComplete(
  enrollmentId: string,
  currentStepIndex: number,
  steps: AutomationStep[],
  enrolledAt: Date,
) {
  const nextIndex = currentStepIndex + 1;
  const nextStep = steps[nextIndex];
  if (!nextStep) {
    await prisma.automationEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED", completedAt: new Date(), currentStepIndex: nextIndex },
    });
    return;
  }
  await prisma.automationEnrollment.update({
    where: { id: enrollmentId },
    data: { currentStepIndex: nextIndex, nextStepDueAt: daysFromNow(nextStep.dayOffset, enrolledAt) },
  });
}
