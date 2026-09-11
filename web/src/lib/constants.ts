export const CUSTOMER_TYPES = [
  "New Vehicle Lead",
  "Previous Customer",
  "Service Customer",
  "Prospect",
] as const;

export const LEAD_STATUSES = ["Hot", "Warm", "Cold"] as const;

export const LEAD_SOURCES = [
  "Walk-in",
  "Website",
  "Referral",
  "Phone Inquiry",
  "Social Media",
  "CSV Import",
  "Event",
] as const;

export const SUGGESTED_TAGS = [
  "Nissan Customer",
  "Nissan Prospect",
  "Service Customer",
  "New Vehicle Lead",
  "Test Drive Lead",
  "Financing Lead",
  "Previous Customer",
  "Hot Lead",
  "Warm Lead",
  "Cold Lead",
] as const;

export type SegmentFieldKind = "text" | "select" | "tag" | "consent";

export interface SegmentFieldDef {
  key: string;
  label: string;
  kind: SegmentFieldKind;
  options?: readonly string[];
}

// Mirrors server/src/config/segmentFields.ts — kept as a small duplicated constant, same pattern
// as CUSTOMER_TYPES / LEAD_STATUSES already being duplicated between the contact form and backend.
export const SEGMENT_FIELDS: SegmentFieldDef[] = [
  { key: "customerType", label: "Customer Type", kind: "select", options: CUSTOMER_TYPES },
  { key: "leadStatus", label: "Lead Status", kind: "select", options: LEAD_STATUSES },
  { key: "leadSource", label: "Lead Source", kind: "select", options: LEAD_SOURCES },
  { key: "productInterest", label: "Product Interest", kind: "text" },
  { key: "location", label: "Location", kind: "text" },
  { key: "company", label: "Company", kind: "text" },
  { key: "tag", label: "Tag", kind: "tag" },
  { key: "consent_email", label: "Email Consent", kind: "consent" },
  { key: "consent_whatsapp", label: "WhatsApp Consent", kind: "consent" },
  { key: "consent_viber", label: "Viber Consent", kind: "consent" },
];

export const OPERATORS_BY_KIND: Record<SegmentFieldKind, { value: string; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "is exactly" },
    { value: "not_equals", label: "is not" },
  ],
  select: [
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
  ],
  tag: [
    { value: "has", label: "has tag" },
    { value: "not_has", label: "does not have tag" },
  ],
  consent: [{ value: "is", label: "is" }],
};

export const CONSENT_VALUE_OPTIONS = [
  { value: "opted_in", label: "Opted in" },
  { value: "opted_out", label: "Opted out" },
  { value: "no_record", label: "No record" },
];

// Mirrors server/src/config/templateCategories.ts and personalization.ts
export const TEMPLATE_CATEGORIES = [
  "New Vehicle Promotion",
  "Service Promotion",
  "Parts Promotion",
  "Accessories Promotion",
  "Financing Promotion",
  "Event Invitation",
  "Test Drive Invitation",
  "Customer Follow-Up",
  "Birthday Greeting",
  "Anniversary Greeting",
] as const;

export const CHANNELS = ["EMAIL", "WHATSAPP", "VIBER"] as const;

export const PERSONALIZATION_VARIABLES = [
  { key: "first_name", label: "First name", sample: "Jo" },
  { key: "last_name", label: "Last name", sample: "Gahiton" },
  { key: "company", label: "Company", sample: "Your Nissan Dealership" },
  { key: "product_interest", label: "Product interest", sample: "SUV" },
] as const;

// Campaign "type" reuses the same category list as templates — a campaign is conceptually
// "a New Vehicle Promotion sent out", same categories as the content it's built from.
export const CAMPAIGN_TYPES = TEMPLATE_CATEGORIES;

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "PAUSED",
  "CANCELLED",
  "FAILED",
] as const;

export const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SCHEDULED: "bg-blue-100 text-blue-700",
  SENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-red-100 text-red-700",
  FAILED: "bg-red-100 text-red-700",
};

// Campaign.channel values map to a different Integration.type enum (EMAIL campaigns send
// through a connected Gmail integration specifically) — mirrors
// server/src/services/campaign.service.ts CHANNEL_TO_INTEGRATION_TYPE.
export const CHANNEL_TO_INTEGRATION_TYPE: Record<string, string> = {
  EMAIL: "GMAIL",
  WHATSAPP: "WHATSAPP",
  VIBER: "VIBER",
};

// Mirrors server/src/config/automationTriggers.ts
export const AUTOMATION_TRIGGER_TYPES = ["NEW_CONTACT", "LEAD_STATUS_CHANGED", "MANUAL_ONLY"] as const;

export const AUTOMATION_TRIGGER_LABELS: Record<string, string> = {
  NEW_CONTACT: "New contact created",
  LEAD_STATUS_CHANGED: "Lead status changed to…",
  MANUAL_ONLY: "Manual enrollment only",
};

export const ENROLLMENT_STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export const CONTACT_CSV_HEADERS = [
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
