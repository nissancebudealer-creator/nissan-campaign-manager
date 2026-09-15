import { z } from "zod";

export const CONTACT_FIELDS = [
  "firstName",
  "lastName",
  "company",
  "email",
  "mobileNumber",
  "whatsappNumber",
  "viberNumber",
  "customerType",
  "productInterest",
  "location",
  "leadSource",
  "leadStatus",
  "notes",
] as const;

export const contactInputSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  company: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  mobileNumber: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  viberNumber: z.string().optional().nullable(),
  customerType: z.string().optional().nullable(),
  productInterest: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  leadSource: z.string().optional().nullable(),
  leadStatus: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
});

export const contactUpdateSchema = contactInputSchema.partial();

export const bulkUpdateSchema = z.object({
  contactIds: z.array(z.string()).min(1),
  addTagIds: z.array(z.string()).optional(),
  removeTagIds: z.array(z.string()).optional(),
  leadStatus: z.string().optional(),
});

export const consentInputSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP", "VIBER"]),
  optIn: z.boolean(),
  consentSource: z.string().optional().nullable(),
});

const importRowSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  company: z.string().trim().optional(),
  email: z.union([z.string().trim().email("Invalid email"), z.literal("")]).optional(),
  mobileNumber: z.string().trim().optional(),
  whatsappNumber: z.string().trim().optional(),
  viberNumber: z.string().trim().optional(),
  customerType: z.string().trim().optional(),
  productInterest: z.string().trim().optional(),
  location: z.string().trim().optional(),
  leadSource: z.string().trim().optional(),
  leadStatus: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const importRequestSchema = z.object({
  dryRun: z.boolean(),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(10000),
});

export function validateImportRow(raw: Record<string, string>) {
  return importRowSchema.safeParse(raw);
}
