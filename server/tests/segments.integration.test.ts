import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database configured in server/.env — same pattern
// as tests/contacts.integration.test.ts. All test data uses the @phase3test.example marker
// domain and is cleaned up in afterAll.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
if (parsedEnv?.JWT_SECRET) process.env.JWT_SECRET = parsedEnv.JWT_SECRET;

const TEST_EMAIL_DOMAIN = "@phase3test.example";

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const contactService = await import("../src/services/contact.service.js");
  const consentService = await import("../src/services/consent.service.js");
  const segmentService = await import("../src/services/segment.service.js");
  return { prisma, contactService, consentService, segmentService };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let testUserId: string;
let hotSuvId: string;
let coldSedanId: string;
let previousServiceId: string;
let tagId: string;

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;

  await prisma.contactTag.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: "Phase3Test" } } });
  await prisma.tag.deleteMany({ where: { name: "Phase3TestTag" } });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const user = await prisma.user.upsert({
    where: { email: "phase3-test-runner@phase3test.example" },
    update: {},
    create: {
      email: "phase3-test-runner@phase3test.example",
      passwordHash: "not-a-real-hash",
      firstName: "Phase3",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  testUserId = user.id;

  const tag = await prisma.tag.create({ data: { name: "Phase3TestTag" } });
  tagId = tag.id;

  const hotSuv = await modules.contactService.createContact(
    {
      firstName: "Hot",
      lastName: "SuvLead",
      email: `hotsuv${TEST_EMAIL_DOMAIN}`,
      customerType: "New Vehicle Lead",
      leadStatus: "Hot",
      productInterest: "SUV",
      tagIds: [tagId],
    },
    testUserId,
  );
  hotSuvId = hotSuv.id;

  const coldSedan = await modules.contactService.createContact(
    {
      firstName: "Cold",
      lastName: "SedanLead",
      email: `coldsedan${TEST_EMAIL_DOMAIN}`,
      customerType: "New Vehicle Lead",
      leadStatus: "Cold",
      productInterest: "Sedan",
    },
    testUserId,
  );
  coldSedanId = coldSedan.id;

  const previousService = await modules.contactService.createContact(
    {
      firstName: "Previous",
      lastName: "ServiceCustomer",
      email: `prevservice${TEST_EMAIL_DOMAIN}`,
      customerType: "Previous Customer",
      leadStatus: "Warm",
    },
    testUserId,
  );
  previousServiceId = previousService.id;

  await modules.consentService.setConsent({
    contactId: hotSuvId,
    channel: "EMAIL",
    optIn: true,
    consentSource: "Web form",
    actorId: testUserId,
  });
  await modules.consentService.setConsent({
    contactId: coldSedanId,
    channel: "EMAIL",
    optIn: false,
    actorId: testUserId,
  });
});

afterAll(async () => {
  const { prisma } = modules;
  await prisma.segment.deleteMany({ where: { name: { startsWith: "Phase3Test" } } });
  await prisma.contactTag.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
  await prisma.tag.delete({ where: { id: tagId } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("segment rule matching", () => {
  it("matches an AND group: Product Interest = SUV AND Lead Status = Hot", async () => {
    const { segmentService } = modules;
    const rules = {
      groups: [
        {
          conditions: [
            { field: "productInterest" as const, operator: "equals", value: "SUV" },
            { field: "leadStatus" as const, operator: "equals", value: "Hot" },
          ],
        },
      ],
    };
    const { contacts } = await segmentService.previewMatching(rules, 1, 50);
    const ids = contacts.map((c) => c.id);
    expect(ids).toContain(hotSuvId);
    expect(ids).not.toContain(coldSedanId);
    expect(ids).not.toContain(previousServiceId);
  });

  it("matches an OR of two groups", async () => {
    const { segmentService } = modules;
    const rules = {
      groups: [
        { conditions: [{ field: "leadStatus" as const, operator: "equals", value: "Hot" }] },
        { conditions: [{ field: "customerType" as const, operator: "equals", value: "Previous Customer" }] },
      ],
    };
    const { contacts } = await segmentService.previewMatching(rules, 1, 50);
    const ids = contacts.map((c) => c.id);
    expect(ids).toContain(hotSuvId);
    expect(ids).toContain(previousServiceId);
    expect(ids).not.toContain(coldSedanId);
  });

  it("matches tag membership", async () => {
    const { segmentService } = modules;
    const rules = {
      groups: [{ conditions: [{ field: "tag" as const, operator: "has", value: "Phase3TestTag" }] }],
    };
    const { contacts } = await segmentService.previewMatching(rules, 1, 50);
    const ids = contacts.map((c) => c.id);
    expect(ids).toContain(hotSuvId);
    expect(ids).not.toContain(coldSedanId);
  });

  it("matches consent state: opted in vs opted out", async () => {
    const { segmentService } = modules;
    const optedInRules = {
      groups: [{ conditions: [{ field: "consent_email" as const, operator: "is", value: "opted_in" }] }],
    };
    const optedIn = await segmentService.previewMatching(optedInRules, 1, 50);
    expect(optedIn.contacts.map((c) => c.id)).toContain(hotSuvId);

    const optedOutRules = {
      groups: [{ conditions: [{ field: "consent_email" as const, operator: "is", value: "opted_out" }] }],
    };
    const optedOut = await segmentService.previewMatching(optedOutRules, 1, 50);
    expect(optedOut.contacts.map((c) => c.id)).toContain(coldSedanId);
    expect(optedOut.contacts.map((c) => c.id)).not.toContain(hotSuvId);
  });
});

describe("segment CRUD", () => {
  it("creates, previews, updates, and deletes a segment", async () => {
    const { segmentService } = modules;
    const rules = {
      groups: [{ conditions: [{ field: "leadStatus" as const, operator: "equals", value: "Hot" }] }],
    };

    const segment = await segmentService.createSegment(
      { name: "Phase3Test Hot Leads", description: "test", rules },
      testUserId,
    );
    expect(segment.id).toBeTruthy();

    const fetched = await segmentService.getSegment(segment.id);
    expect(fetched.name).toBe("Phase3Test Hot Leads");

    const updated = await segmentService.updateSegment(
      segment.id,
      { name: "Phase3Test Hot Leads Renamed" },
      testUserId,
    );
    expect(updated.name).toBe("Phase3Test Hot Leads Renamed");

    await segmentService.deleteSegment(segment.id, testUserId);
    await expect(segmentService.getSegment(segment.id)).rejects.toThrow("Segment not found");
  });
});
