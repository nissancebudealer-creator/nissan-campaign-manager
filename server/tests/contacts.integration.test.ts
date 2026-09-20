import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database configured in server/.env.
// All test data uses the @phase2test.example marker domain and is cleaned up in afterAll,
// so this is safe to run repeatedly against a shared dev database.
//
// Explicitly (re)load server/.env and force DATABASE_URL from it, in case another test file
// in this run already set a dummy DATABASE_URL on process.env — dotenv won't overwrite an
// existing var by default, so we do it ourselves to guarantee we hit the real database here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) {
  process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
}
if (parsedEnv?.JWT_SECRET) {
  process.env.JWT_SECRET = parsedEnv.JWT_SECRET;
}

const TEST_EMAIL_DOMAIN = "@phase2test.example";

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const contactService = await import("../src/services/contact.service.js");
  const consentService = await import("../src/services/consent.service.js");
  const tagService = await import("../src/services/tag.service.js");
  const { validateImportRow } = await import("../src/schemas/contact.schema.js");
  return { prisma, contactService, consentService, tagService, validateImportRow };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let testUserId: string;
let testTagId: string;

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;

  // Clean any leftovers from a previous failed run before starting.
  await prisma.contactTag.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
  await prisma.tag.deleteMany({ where: { name: "Phase2TestTag" } });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const user = await prisma.user.upsert({
    where: { email: "phase2-test-runner@phase2test.example" },
    update: {},
    create: {
      email: "phase2-test-runner@phase2test.example",
      passwordHash: "not-a-real-hash",
      firstName: "Phase2",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  testUserId = user.id;

  const tag = await prisma.tag.create({ data: { name: "Phase2TestTag", color: "#0000ff" } });
  testTagId = tag.id;
});

afterAll(async () => {
  const { prisma } = modules;
  await prisma.contactTag.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
  await prisma.tag.delete({ where: { id: testTagId } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("contact CRUD", () => {
  it("creates, reads, updates, and deletes a contact", async () => {
    const { contactService } = modules;

    const created = await contactService.createContact(
      {
        firstName: "Ana",
        lastName: "Reyes",
        email: `ana.reyes${TEST_EMAIL_DOMAIN}`,
        mobileNumber: "+639171234567",
        customerType: "New Vehicle Lead",
        leadStatus: "Hot",
        tagIds: [testTagId],
      },
      testUserId,
    );

    expect(created.id).toBeTruthy();
    expect(created.tags).toHaveLength(1);

    const fetched = await contactService.getContact(created.id);
    expect(fetched.email).toBe(`ana.reyes${TEST_EMAIL_DOMAIN}`);

    const updated = await contactService.updateContact(
      created.id,
      { leadStatus: "Warm" },
      testUserId,
    );
    expect(updated.leadStatus).toBe("Warm");

    await contactService.deleteContact(created.id, testUserId);
    await expect(contactService.getContact(created.id)).rejects.toThrow("Contact not found");
  });

  it("rejects duplicate emails", async () => {
    const { contactService } = modules;
    const email = `dup${TEST_EMAIL_DOMAIN}`;

    await contactService.createContact({ firstName: "A", lastName: "One", email }, testUserId);
    await expect(
      contactService.createContact({ firstName: "B", lastName: "Two", email }, testUserId),
    ).rejects.toThrow("already exists");
  });

  it("records a real MX-check result on the contact — true for a real domain, false for one with no mail server", async () => {
    const { contactService } = modules;
    // Deliberately NOT a *.example address (the file's usual TEST_EMAIL_DOMAIN) — those are RFC
    // 2606 reserved documentation domains that this feature correctly treats as "unknown" rather
    // than a real signal (see emailDomainValidation.unit.test.ts), so this needs a genuinely real
    // domain to actually exercise the check. Cleaned up inline since it falls outside this file's
    // usual TEST_EMAIL_DOMAIN-scoped afterAll.
    const validDomainContact = await contactService.createContact(
      { firstName: "RealDomain", lastName: "Contact", email: "nissan-test-marker-valid@gmail.com" },
      testUserId,
    );
    const invalidDomainContact = await contactService.createContact(
      {
        firstName: "DeadDomain",
        lastName: "Contact",
        email: "nissan-test-marker-invalid@this-domain-definitely-does-not-exist-abc123xyz-nissan-test.com",
      },
      testUserId,
    );

    try {
      expect(validDomainContact.emailDomainValid).toBe(true);
      expect(invalidDomainContact.emailDomainValid).toBe(false);
    } finally {
      await contactService.deleteContact(validDomainContact.id, testUserId);
      await contactService.deleteContact(invalidDomainContact.id, testUserId);
    }
  }, 15000);

  it("lists and searches contacts", async () => {
    const { contactService } = modules;
    await contactService.createContact(
      { firstName: "Searchable", lastName: "Person", email: `searchable${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );

    const results = await contactService.listContacts({ search: "Searchable", page: 1, pageSize: 25 });
    expect(results.total).toBeGreaterThanOrEqual(1);
    expect(results.contacts[0].firstName).toBe("Searchable");
  });
});

describe("consent + suppression", () => {
  it("opting out adds to suppression list; opting back in removes it", async () => {
    const { contactService, consentService, prisma } = modules;
    const contact = await contactService.createContact(
      { firstName: "Consent", lastName: "Test", email: `consent${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );

    await consentService.setConsent({
      contactId: contact.id,
      channel: "EMAIL",
      optIn: true,
      consentSource: "Web form",
      actorId: testUserId,
    });

    let suppressed = await prisma.suppressionList.findFirst({
      where: { contactId: contact.id, channel: "EMAIL" },
    });
    expect(suppressed).toBeNull();

    await consentService.setConsent({
      contactId: contact.id,
      channel: "EMAIL",
      optIn: false,
      actorId: testUserId,
    });

    suppressed = await prisma.suppressionList.findFirst({
      where: { contactId: contact.id, channel: "EMAIL" },
    });
    expect(suppressed).not.toBeNull();

    // Every new contact is opted in on all channels by default now (see contact.service.ts), so
    // full history also carries that initial EMAIL/WHATSAPP/VIBER grant — filter to just EMAIL's
    // own append-only trail: the default grant, then this test's explicit opt-in, then opt-out.
    const history = await consentService.getConsentHistory(contact.id);
    const emailHistory = history.filter((h) => h.channel === "EMAIL");
    expect(emailHistory).toHaveLength(3);
    expect(emailHistory[0].optIn).toBe(false); // most recent first
  });
});

describe("CSV import validation", () => {
  it("flags invalid rows and duplicate emails, accepts valid ones", async () => {
    const { contactService, validateImportRow } = modules;

    await contactService.createContact(
      { firstName: "Existing", lastName: "Contact", email: `existing${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );

    const rows = [
      { firstName: "New", lastName: "Person", email: `newperson${TEST_EMAIL_DOMAIN}` },
      { firstName: "", lastName: "NoFirstName", email: `nofirst${TEST_EMAIL_DOMAIN}` },
      { firstName: "Existing", lastName: "Contact", email: `existing${TEST_EMAIL_DOMAIN}` },
    ];

    const results = await contactService.validateImportRows(rows, validateImportRow);
    expect(results[0].status).toBe("valid");
    expect(results[1].status).toBe("invalid");
    expect(results[2].status).toBe("duplicate");
  });

  it("commits only valid rows and skips the rest", async () => {
    const { contactService, validateImportRow } = modules;
    const rows = [
      { firstName: "Committed", lastName: "Row", email: `committed${TEST_EMAIL_DOMAIN}` },
    ];
    const validated = await contactService.validateImportRows(rows, validateImportRow);
    const validRows = validated.filter((r) => r.status === "valid").map((r) => r.data);
    const result = await contactService.commitImport(validRows, testUserId);
    expect(result.created).toBe(1);
  });

  it("flags a row whose email domain genuinely has no mail server, and suggests the likely typo fix", async () => {
    const { contactService, validateImportRow } = modules;
    // gmial.com is a real near-miss typo of gmail.com and genuinely has no MX records — this is
    // the exact pattern (a real "gmail.co" address in a sent campaign) that got this app's Google
    // Cloud project flagged for abuse, which is why this feature exists at all.
    const rows = [{ firstName: "Typo", lastName: "Domain", email: "typo-domain-phase2test@gmial.com" }];
    const results = await contactService.validateImportRows(rows, validateImportRow);
    expect(results[0].status).toBe("invalid");
    expect(results[0].errors?.[0]).toMatch(/no mail server/i);
    expect(results[0].errors?.[0]).toMatch(/did you mean "gmail\.com"/i);
  }, 10000);

  it("opts an imported contact in on every channel by default", async () => {
    const { prisma, contactService, consentService, validateImportRow } = modules;
    const rows = [
      { firstName: "ImportedConsent", lastName: "Row", email: `importedconsent${TEST_EMAIL_DOMAIN}` },
    ];
    const validated = await contactService.validateImportRows(rows, validateImportRow);
    const validRows = validated.filter((r) => r.status === "valid").map((r) => r.data);
    await contactService.commitImport(validRows, testUserId);

    const contact = await prisma.contact.findFirstOrThrow({
      where: { email: `importedconsent${TEST_EMAIL_DOMAIN}` },
    });
    const history = await consentService.getConsentHistory(contact.id);
    const optedInChannels = history.filter((c) => c.optIn).map((c) => c.channel);
    expect(optedInChannels.sort()).toEqual(["EMAIL", "VIBER", "WHATSAPP"]);
  });
});
