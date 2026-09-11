import { z } from "zod";

export const brandingUpdateSchema = z.object({
  companyName: z.string().trim().max(120).optional().nullable(),
  logoUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal("")),
});
