import { PERSONALIZATION_VARIABLES } from "./constants";

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

const SAMPLE_VALUES: Record<string, string> = Object.fromEntries(
  PERSONALIZATION_VARIABLES.map((v) => [v.key, v.sample]),
);

// Renders template text with sample contact data for preview purposes only — actual sending
// (Phase 5+) substitutes real contact fields server-side.
export function renderWithSampleData(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(VARIABLE_PATTERN, (match, name: string) => SAMPLE_VALUES[name] ?? match);
}
