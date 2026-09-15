import { z } from "zod";
import { TEMPLATE_CATEGORIES } from "../config/templateCategories.js";

const channelSchema = z.enum(["EMAIL", "WHATSAPP", "VIBER"]);
const urlOrEmpty = z.string().url("Must be a valid URL").optional().nullable().or(z.literal(""));
const imagePositionSchema = z.enum(["TOP", "BOTTOM"]);

export const campaignInputSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(TEMPLATE_CATEGORIES),
    channel: channelSchema,
    segmentId: z.string().min(1, "Target audience (segment) is required"),
    templateId: z.string().optional().nullable(),
    subject: z.string().optional().nullable(),
    message: z.string().min(1, "Message is required"),
    imageUrl: urlOrEmpty,
    imagePosition: imagePositionSchema.optional(),
    videoUrl: urlOrEmpty,
    ctaLabel: z.string().optional().nullable(),
    ctaUrl: urlOrEmpty,
    whatsappTemplateName: z.string().optional().nullable(),
    whatsappTemplateLanguage: z.string().optional().nullable(),
    tagIds: z.array(z.string()).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.channel === "EMAIL" && !input.subject?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subject is required for email campaigns",
        path: ["subject"],
      });
    }
    if ((input.ctaLabel && !input.ctaUrl) || (input.ctaUrl && !input.ctaLabel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CTA label and CTA URL must be set together",
        path: ["ctaUrl"],
      });
    }
  });

export const campaignUpdateSchema = campaignInputSchema.innerType().partial();

export const campaignListQuerySchema = z.object({
  status: z.enum(["DRAFT", "SCHEDULED", "SENDING", "SENT", "PAUSED", "CANCELLED", "FAILED"]).optional(),
  channel: channelSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
});

export const scheduleSchema = z.object({
  scheduledAt: z.string().datetime({ message: "Must be a valid ISO date-time" }),
});

// Test sends always go to the requesting user's own account email — no separate recipient input.
export const sendRequestSchema = z.object({
  testMode: z.boolean().default(false),
  // Caps how many recipients this one call attempts — leaving it unset sends to everyone
  // currently eligible (still bounded by the provider's real daily limit). Calling send again
  // later (manually, or automatically resuming a paused one) picks up wherever the last call
  // stopped.
  batchSize: z.number().int().positive().max(10000).optional(),
});
