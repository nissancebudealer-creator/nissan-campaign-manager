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

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
