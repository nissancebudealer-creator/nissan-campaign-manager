import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database configured in server/.env — same pattern
// as the other Phase 2-4 integration tests.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
if (parsedEnv?.JWT_SECRET) process.env.JWT_SECRET = parsedEnv.JWT_SECRET;

const TEST_EMAIL_DOMAIN = "@phase5test.example";

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const contactService = await import("../src/services/contact.service.js");
  const consentService = await import("../src/services/consent.service.js");
  const segmentService = await import("../src/services/segment.service.js");
  const campaignService = await import("../src/services/campaign.service.js");
  return { prisma, contactService, consentService, segmentService, campaignService };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let testUserId: string;
let segmentId: string;
let optedInContactId: string;
let optedOutContactId: string;

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;

  await prisma.campaign.deleteMany({ where: { name: { startsWith: "Phase5Test" } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: "Phase5Test" } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const user = await prisma.user.upsert({
    where: { email: "phase5-test-runner@phase5test.example" },
    update: {},
    create: {
      email: "phase5-test-runner@phase5test.example",
      passwordHash: "not-a-real-hash",
      firstName: "Phase5",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  testUserId = user.id;

  const optedIn = await modules.contactService.createContact(
    { firstName: "OptedIn", lastName: "Contact", email: `optedin${TEST_EMAIL_DOMAIN}`, leadStatus: "Hot" },
    testUserId,
  );
  optedInContactId = optedIn.id;

  const optedOut = await modules.contactService.createContact(
    { firstName: "OptedOut", lastName: "Contact", email: `optedout${TEST_EMAIL_DOMAIN}`, leadStatus: "Hot" },
    testUserId,
  );
  optedOutContactId = optedOut.id;

  await modules.consentService.setConsent({
    contactId: optedInContactId,
    channel: "EMAIL",
    optIn: true,
    actorId: testUserId,
  });
  await modules.consentService.setConsent({
    contactId: optedOutContactId,
    channel: "EMAIL",
    optIn: false,
    actorId: testUserId,
  });

  const segment = await modules.segmentService.createSegment(
    {
      name: "Phase5Test Hot Leads",
      rules: { groups: [{ conditions: [{ field: "leadStatus", operator: "equals", value: "Hot" }] }] },
    },
    testUserId,
  );
  segmentId = segment.id;
});

afterAll(async () => {
  const { prisma } = modules;
  await prisma.campaign.deleteMany({ where: { name: { startsWith: "Phase5Test" } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: "Phase5Test" } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
  const mgr = await prisma.user.findUnique({ where: { email: "phase5-test-mgr@phase5test.example" } });
  if (mgr) {
    await prisma.auditLog.deleteMany({ where: { userId: mgr.id } });
    await prisma.user.delete({ where: { id: mgr.id } }).catch(() => {});
  }
  await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("audience preview", () => {
  it("excludes opted-out contacts from the estimated send count, includes opted-in ones", async () => {
    const { campaignService } = modules;
    const preview = await campaignService.previewAudience(segmentId, "EMAIL");
    expect(preview.totalMatching).toBeGreaterThanOrEqual(2);
    expect(preview.optedOutCount).toBeGreaterThanOrEqual(1);
    expect(preview.estimatedMessages).toBe(
      preview.totalMatching - preview.optedOutCount - preview.noConsentCount,
    );

    const sampleIds = preview.sample.map((c) => c.id);
    expect(sampleIds).not.toContain(optedOutContactId);
    expect(sampleIds).toContain(optedInContactId);
  });

  it("excludes contacts with no recorded opt-in at all — not just explicit opt-outs", async () => {
    const { contactService, campaignService } = modules;
    const noConsentContact = await contactService.createContact(
      { firstName: "NoConsent", lastName: "Contact", email: `noconsent${TEST_EMAIL_DOMAIN}`, leadStatus: "Hot" },
      testUserId,
    );
    const preview = await campaignService.previewAudience(segmentId, "EMAIL");
    expect(preview.noConsentCount).toBeGreaterThanOrEqual(1);
    const sampleIds = preview.sample.map((c) => c.id);
    expect(sampleIds).not.toContain(noConsentContact.id);
  });
});

describe("campaign CRUD and lifecycle", () => {
  it("creates a draft, edits it, and enforces edit-lock once cancelled", async () => {
    const { campaignService } = modules;
    const campaign = await campaignService.createCampaign(
      {
        name: "Phase5Test Hot Leads Email",
        type: "New Vehicle Promotion",
        channel: "EMAIL",
        segmentId,
        subject: "Hi {{first_name}}",
        message: "Check out our new lineup!",
      },
      testUserId,
    );
    expect(campaign.status).toBe("DRAFT");

    const updated = await campaignService.updateCampaign(
      campaign.id,
      { name: "Phase5Test Hot Leads Email (Updated)" },
      testUserId,
    );
    expect(updated.name).toBe("Phase5Test Hot Leads Email (Updated)");

    await campaignService.cancelCampaign(campaign.id, testUserId);
    await expect(
      campaignService.updateCampaign(campaign.id, { name: "should fail" }, testUserId),
    ).rejects.toThrow("Cannot edit a campaign that is cancelled");
  });

  it("schedules, pauses, and re-schedules a campaign", async () => {
    const { campaignService } = modules;
    const campaign = await campaignService.createCampaign(
      { name: "Phase5Test Schedulable", type: "Event Invitation", channel: "EMAIL", segmentId, subject: "S", message: "M" },
      testUserId,
    );

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const scheduled = await campaignService.scheduleCampaign(campaign.id, future, testUserId);
    expect(scheduled.status).toBe("SCHEDULED");

    const paused = await campaignService.pauseCampaign(campaign.id, testUserId);
    expect(paused.status).toBe("PAUSED");

    const rescheduled = await campaignService.scheduleCampaign(campaign.id, future, testUserId);
    expect(rescheduled.status).toBe("SCHEDULED");

    // Past-date validation, checked separately on a fresh draft — scheduling an
    // already-SCHEDULED campaign is refused before the date is even considered (correctly
    // exercised by the "Cannot pause a campaign that is..." style checks above).
    const anotherDraft = await campaignService.createCampaign(
      { name: "Phase5Test PastDateCheck", type: "Event Invitation", channel: "EMAIL", segmentId, subject: "S", message: "M" },
      testUserId,
    );
    await expect(
      campaignService.scheduleCampaign(anotherDraft.id, new Date(Date.now() - 1000), testUserId),
    ).rejects.toThrow("must be in the future");
  });

  it("a Marketing Manager can't delete a non-draft campaign, but an Administrator can", async () => {
    const { campaignService, prisma } = modules;
    const mgrRole = await prisma.role.findUniqueOrThrow({ where: { name: "MARKETING_MANAGER" } });
    const mgr = await prisma.user.upsert({
      where: { email: "phase5-test-mgr@phase5test.example" },
      update: {},
      create: {
        email: "phase5-test-mgr@phase5test.example",
        passwordHash: "not-a-real-hash",
        firstName: "Phase5",
        lastName: "TestManager",
        roleId: mgrRole.id,
      },
    });

    const campaign = await campaignService.createCampaign(
      { name: "Phase5Test Deletable", type: "Service Promotion", channel: "EMAIL", segmentId, subject: "S", message: "M" },
      testUserId,
    );
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await campaignService.scheduleCampaign(campaign.id, future, testUserId);

    // Marketing Manager: still blocked once it's no longer a draft — real send history stays
    // erasable only by an Administrator, not the broader write group.
    await expect(
      campaignService.deleteCampaign(campaign.id, mgr.id, "MARKETING_MANAGER"),
    ).rejects.toThrow("Only a draft campaign can be deleted");

    // Administrator: can delete it in any status.
    await campaignService.deleteCampaign(campaign.id, testUserId, "ADMINISTRATOR");
    await expect(campaignService.getCampaign(campaign.id)).rejects.toThrow("Campaign not found");
  });

  it("allows deleting a draft campaign", async () => {
    const { campaignService } = modules;
    const draft = await campaignService.createCampaign(
      { name: "Phase5Test Draft Only", type: "Service Promotion", channel: "EMAIL", segmentId, subject: "S", message: "M" },
      testUserId,
    );
    await campaignService.deleteCampaign(draft.id, testUserId, "ADMINISTRATOR");
    await expect(campaignService.getCampaign(draft.id)).rejects.toThrow("Campaign not found");
  });

  it("duplicates a campaign as a fresh draft", async () => {
    const { campaignService } = modules;
    const original = await campaignService.createCampaign(
      {
        name: "Phase5Test Original",
        type: "Parts Promotion",
        channel: "EMAIL",
        segmentId,
        subject: "S",
        message: "M",
      },
      testUserId,
    );
    const copy = await campaignService.duplicateCampaign(original.id, testUserId);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Phase5Test Original (Copy)");
    expect(copy.status).toBe("DRAFT");
    expect(copy.message).toBe("M");
  });

  it("refuses to send without a connected integration, without faking success", async () => {
    const { campaignService, prisma } = modules;
    // Picks whichever channel has no real CONNECTED integration right now, rather than assuming
    // one specific channel is always unconnected — as of Phase 7, EMAIL, WHATSAPP, and VIBER can
    // all be genuinely connected in a live dev database, so hardcoding one would eventually break
    // against real shared state (exactly what bit EMAIL here back in Phase 6).
    const connected = await prisma.integration.findMany({ where: { status: "CONNECTED" } });
    const connectedTypes = new Set(connected.map((i) => i.type));
    const channelByIntegrationType: Record<string, "EMAIL" | "WHATSAPP" | "VIBER"> = {
      GMAIL: "EMAIL",
      WHATSAPP: "WHATSAPP",
      VIBER: "VIBER",
    };
    const unconnectedChannel = (["GMAIL", "WHATSAPP", "VIBER"] as const)
      .filter((type) => !connectedTypes.has(type))
      .map((type) => channelByIntegrationType[type])[0];
    expect(unconnectedChannel).toBeDefined(); // if this ever fails, all three are really connected

    const campaign = await campaignService.createCampaign(
      { name: "Phase5Test Unsendable", type: "Financing Promotion", channel: unconnectedChannel!, segmentId, message: "M" },
      testUserId,
    );
    await expect(
      campaignService.requestSend(campaign.id, testUserId, { testMode: false }),
    ).rejects.toThrow(`No connected ${unconnectedChannel} integration`);
  });
});
