import Papa from "papaparse";
import { CONTACT_CSV_HEADERS } from "../../lib/constants";

type ContactField = (typeof CONTACT_CSV_HEADERS)[number];

const TEMPLATE_EXAMPLE_ROWS: Record<ContactField, string>[] = [
  {
    firstName: "Juan",
    lastName: "Dela Cruz",
    company: "Dela Cruz Trading",
    email: "juan.delacruz@example.com",
    mobileNumber: "+639171234567",
    whatsappNumber: "+639171234567",
    viberNumber: "+639171234567",
    customerType: "New Vehicle Lead",
    productInterest: "SUV",
    location: "Quezon City",
    leadSource: "Walk-in",
    leadStatus: "Hot",
    notes: "Interested in a test drive this weekend.",
  },
  {
    firstName: "Maria",
    lastName: "Santos",
    company: "",
    email: "maria.santos@example.com",
    mobileNumber: "+639281234567",
    whatsappNumber: "",
    viberNumber: "+639281234567",
    customerType: "Service Customer",
    productInterest: "Sedan",
    location: "Makati",
    leadSource: "Website",
    leadStatus: "Warm",
    notes: "",
  },
];

// Generates the downloadable CSV import template: headers match CONTACT_CSV_HEADERS exactly
// so guessColumnMapping auto-maps every column with nothing left for the user to fix.
export function buildContactCsvTemplate(): string {
  return Papa.unparse({
    fields: [...CONTACT_CSV_HEADERS],
    data: TEMPLATE_EXAMPLE_ROWS.map((row) => CONTACT_CSV_HEADERS.map((field) => row[field])),
  });
}

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
