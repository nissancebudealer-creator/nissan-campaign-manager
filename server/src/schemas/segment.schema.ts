import { z } from "zod";
import { CONSENT_VALUES, OPERATORS_BY_KIND, SEGMENT_FIELD_KEYS, SEGMENT_FIELD_KIND } from "../config/segmentFields.js";

const conditionSchema = z
  .object({
    field: z.enum(SEGMENT_FIELD_KEYS),
    operator: z.string(),
    value: z.string().min(1, "Value is required"),
  })
  .superRefine((condition, ctx) => {
    const kind = SEGMENT_FIELD_KIND[condition.field];
    const allowedOperators = OPERATORS_BY_KIND[kind];
    if (!allowedOperators.includes(condition.operator)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator "${condition.operator}" is not valid for field "${condition.field}"`,
        path: ["operator"],
      });
    }
    if (kind === "consent" && !(CONSENT_VALUES as readonly string[]).includes(condition.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value must be one of: ${CONSENT_VALUES.join(", ")}`,
        path: ["value"],
      });
    }
  });

const groupSchema = z.object({
  conditions: z.array(conditionSchema).min(1, "A group needs at least one condition"),
});

export const rulesSchema = z.object({
  groups: z.array(groupSchema).min(1, "A segment needs at least one group"),
});

export const segmentInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  rules: rulesSchema,
});

export const segmentUpdateSchema = segmentInputSchema.partial();

export type SegmentCondition = z.infer<typeof conditionSchema>;
export type SegmentGroup = z.infer<typeof groupSchema>;
export type SegmentRules = z.infer<typeof rulesSchema>;
