import { CONTACT_CSV_HEADERS } from "../../lib/constants";

type ContactField = (typeof CONTACT_CSV_HEADERS)[number];

const FIELD_ALIASES: Record<ContactField, string[]> = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  company: ["company", "business", "employer"],
  email: ["email", "e-mail", "email address"],
  mobileNumber: ["mobile", "mobile number", "phone", "phone number", "cell"],
  whatsappNumber: ["whatsapp", "whatsapp number"],
  viberNumber: ["viber", "viber number"],
  customerType: ["customer type", "type"],
  productInterest: ["product interest", "interest", "vehicle interest"],
  location: ["location", "city", "address"],
  leadSource: ["lead source", "source"],
  leadStatus: ["lead status", "status"],
  notes: ["notes", "note", "comments"],
};

// Best-effort auto mapping from raw CSV headers to our known contact fields, so the user
// starts from a sensible default and only has to adjust what doesn't match.
export function guessColumnMapping(csvHeaders: string[]): Record<ContactField, string | ""> {
  const mapping = Object.fromEntries(CONTACT_CSV_HEADERS.map((f) => [f, ""])) as Record<
    ContactField,
    string
  >;

  for (const field of CONTACT_CSV_HEADERS) {
    const aliases = [field.toLowerCase(), ...FIELD_ALIASES[field]];
    const match = csvHeaders.find((h) => aliases.includes(h.trim().toLowerCase()));
    if (match) mapping[field] = match;
  }

  return mapping;
}

export function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<ContactField, string>,
): Record<string, string>[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const field of CONTACT_CSV_HEADERS) {
      const sourceColumn = mapping[field];
      mapped[field] = sourceColumn ? (row[sourceColumn] ?? "").trim() : "";
    }
    return mapped;
  });
}

export { CONTACT_CSV_HEADERS };
export type { ContactField };
