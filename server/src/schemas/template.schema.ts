import { z } from "zod";
import { TEMPLATE_CATEGORIES } from "../config/templateCategories.js";

const channelSchema = z.enum(["EMAIL", "WHATSAPP", "VIBER"]);
const urlOrEmpty = z.string().url("Must be a valid URL").optional().nullable().or(z.literal(""));
const imagePositionSchema = z.enum(["TOP", "BOTTOM"]);

export const templateInputSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    category: z.enum(TEMPLATE_CATEGORIES),
    channel: channelSchema,
    subject: z.string().optional().nullable(),
    body: z.string().min(1, "Message body is required"),
    imageUrl: urlOrEmpty,
    imagePosition: imagePositionSchema.optional(),
    ctaLabel: z.string().optional().nullable(),
    ctaUrl: urlOrEmpty,
  })
  .superRefine((input, ctx) => {
    if (input.channel === "EMAIL" && !input.subject?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subject is required for email templates",
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

export const templateUpdateSchema = templateInputSchema.innerType().partial();

export const templateListQuerySchema = z.object({
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  channel: channelSchema.optional(),
});
