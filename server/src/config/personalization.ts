// Personalization variables available in templates and campaigns — mirrored in
// web/src/lib/constants.ts. Kept intentionally small and matched 1:1 to Contact fields; a
// template can only use a variable that campaign sending will actually be able to fill in.
export const PERSONALIZATION_VARIABLES = [
  "first_name",
  "last_name",
  "company",
  "product_interest",
] as const;

export type PersonalizationVariable = (typeof PERSONALIZATION_VARIABLES)[number];

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

// Scans template text for {{variable}} tokens and returns only the ones we actually support,
// deduplicated — this is what gets stored in Template.variables, rather than trusting free-form
// client input, so the stored list can never drift from what the body actually references.
export function extractUsedVariables(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(VARIABLE_PATTERN)) {
      const name = match[1];
      if ((PERSONALIZATION_VARIABLES as readonly string[]).includes(name)) {
        found.add(name);
      }
    }
  }
  return Array.from(found);
}

export interface PersonalizationContext {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  product_interest?: string | null;
}

// Substitutes {{variable}} tokens with real contact data for an actual send. Unlike the frontend
// preview (which always uses sample data), this is what determines the message a real recipient
// gets — a missing field renders as an empty string rather than leaving the literal "{{...}}" in
// the sent message.
export function renderPersonalization(text: string, context: PersonalizationContext): string {
  return text.replace(VARIABLE_PATTERN, (match, name: string) => {
    if (!(PERSONALIZATION_VARIABLES as readonly string[]).includes(name)) return match;
    const value = context[name as PersonalizationVariable];
    return value ?? "";
  });
}
