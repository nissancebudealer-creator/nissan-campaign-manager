import { z } from "zod";
import { AUTOMATION_TRIGGER_TYPES } from "../config/automationTriggers.js";

const stepSchema = z
  .object({
    dayOffset: z.number().int().min(0, "Day offset can't be negative"),
    channel: z.enum(["EMAIL", "WHATSAPP", "VIBER"]),
    templateId: z.string().min(1, "Each step needs a template"),
    whatsappTemplateName: z.string().optional(),
    whatsappTemplateLanguage: z.string().optional(),
  })
  .superRefine((step, ctx) => {
    if (step.channel === "WHATSAPP" && !step.whatsappTemplateName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "WhatsApp steps need an approved template name",
        path: ["whatsappTemplateName"],
      });
    }
  });

export const automationRuleInputSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    triggerType: z.enum(AUTOMATION_TRIGGER_TYPES),
    triggerValue: z.string().optional().nullable(),
    steps: z.array(stepSchema).min(1, "Add at least one step"),
    isActive: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.triggerType === "LEAD_STATUS_CHANGED" && !input.triggerValue?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose which lead status should trigger this automation",
        path: ["triggerValue"],
      });
    }
    const offsets = input.steps.map((s) => s.dayOffset);
    if (new Set(offsets).size !== offsets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Steps must have distinct day offsets",
        path: ["steps"],
      });
    }
  });

export const automationRuleUpdateSchema = automationRuleInputSchema.innerType().partial();

export const enrollContactSchema = z.object({
  contactId: z.string().min(1),
});
