// Registry of fields the segment rule builder can filter contacts on. The frontend mirrors this
// (web/src/lib/constants.ts SEGMENT_FIELDS) to render the right input for each field — kept as a
// small duplicated constant rather than a shared package, consistent with how CUSTOMER_TYPES /
// LEAD_STATUSES are already duplicated between the contact form and this backend.
export const SEGMENT_FIELD_KEYS = [
  "customerType",
  "leadStatus",
  "leadSource",
  "productInterest",
  "location",
  "company",
  "tag",
  "consent_email",
  "consent_whatsapp",
  "consent_viber",
] as const;

export type SegmentFieldKey = (typeof SEGMENT_FIELD_KEYS)[number];

export type FieldKind = "text" | "select" | "tag" | "consent";

export const SEGMENT_FIELD_KIND: Record<SegmentFieldKey, FieldKind> = {
  customerType: "select",
  leadStatus: "select",
  leadSource: "select",
  productInterest: "text",
  location: "text",
  company: "text",
  tag: "tag",
  consent_email: "consent",
  consent_whatsapp: "consent",
  consent_viber: "consent",
};

export const OPERATORS_BY_KIND: Record<FieldKind, string[]> = {
  text: ["contains", "equals", "not_equals"],
  select: ["equals", "not_equals"],
  tag: ["has", "not_has"],
  consent: ["is"],
};

export const CONSENT_VALUES = ["opted_in", "opted_out", "no_record"] as const;
