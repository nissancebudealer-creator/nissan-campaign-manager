// Automation trigger types — mirrored in web/src/lib/constants.ts. Kept as a small fixed set so
// every trigger has real, well-defined evaluation logic in automation.service.ts rather than an
// open-ended "any event" system that would be easy to get wrong.
export const AUTOMATION_TRIGGER_TYPES = ["NEW_CONTACT", "LEAD_STATUS_CHANGED", "MANUAL_ONLY"] as const;
export type AutomationTriggerTypeValue = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerTypeValue, string> = {
  NEW_CONTACT: "New contact created",
  LEAD_STATUS_CHANGED: "Lead status changed to…",
  MANUAL_ONLY: "Manual enrollment only",
};

export interface AutomationStep {
  dayOffset: number; // days after enrollment; 0 sends as soon as the runner next checks
  channel: "EMAIL" | "WHATSAPP" | "VIBER";
  templateId: string;
  whatsappTemplateName?: string; // required when channel is WHATSAPP — see COMPLIANCE.md
  whatsappTemplateLanguage?: string;
}
