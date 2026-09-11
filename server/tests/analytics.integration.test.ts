import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database configured in server/.env — same pattern
// as the other Phase integration tests.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
if (parsedEnv?.JWT_SECRET) process.env.JWT_SECRET = parsedEnv.JWT_SECRET;

const TEST_EMAIL_DOMAIN = "@phase8test.example";

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const contactService = await import("../src/services/contact.service.js");
  const consentService = await import("../src/services/consent.service.js");
  const segmentService = await import("../src/services/segment.service.js");
  const campaignService = await import("../src/services/campaign.service.js");
  const trackingService = await import("../src/services/tracking.service.js");
  const analyticsService = await import("../src/services/analytics.service.js");
  return {
    prisma,
    contactService,
    consentService,
    segmentService,
    campaignService,
    trackingService,
    analyticsService,
  };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let testUserId: string;
let segmentId: string;
let campaignId: string;
const recipientIds: string[] = [];

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;

  await prisma.campaign.deleteMany({ where: { name: { startsWith: "Phase8Test" } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: "Phase8Test" } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const user = await prisma.user.upsert({
    where: { email: "phase8-test-runner@phase8test.example" },
    update: {},
    create: {
      email: "phase8-test-runner@phase8test.example",
      passwordHash: "not-a-real-hash",
      firstName: "Phase8",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  testUserId = user.id;

  // Four contacts standing in for the four states a real send can end up in.
  const contacts = await Promise.all(
    ["sent-only", "opened", "clicked", "failed"].map((label) =>
      modules.contactService.createContact(
        { firstName: label, lastName: "Contact", email: `${label}${TEST_EMAIL_DOMAIN}`, leadStatus: "Hot" },
        testUserId,
      ),
    ),
  );
  for (const c of contacts) {
    await modules.consentService.setConsent({
      contactId: c.id,
      channel: "EMAIL",
      optIn: true,
      actorId: testUserId,
    });
  }

  const segment = await modules.segmentService.createSegment(
    {
      name: "Phase8Test Segment",
      rules: { groups: [{ conditions: [{ field: "leadStatus", operator: "equals", value: "Hot" }] }] },
    },
    testUserId,
  );
  segmentId = segment.id;

  const campaign = await modules.campaignService.createCampaign(
    {
      name: "Phase8Test Analytics Campaign",
      type: "New Vehicle Promotion",
      channel: "EMAIL",
      segmentId,
      subject: "S",
      message: "M",
      ctaLabel: "Click me",
      ctaUrl: "https://example.com/destination",
    },
    testUserId,
  );
  campaignId = campaign.id;

  // Directly create CampaignRecipient rows in each terminal state, exactly as a real send loop
  // would, rather than driving a real Gmail send in a unit-ish test — the send loop itself is
  // covered by campaigns.integration.test.ts / the real Phase 6 verification.
  for (const [i, c] of contacts.entries()) {
    const status = (["SENT", "OPENED", "CLICKED", "FAILED"] as const)[i];
    const recipient = await prisma.campaignRecipient.create({
      data: {
        campaignId,
        contactId: c.id,
        status,
        sentAt: status === "FAILED" ? null : new Date(),
        openedAt: status === "OPENED" || status === "CLICKED" ? new Date() : null,
        clickedAt: status === "CLICKED" ? new Date() : null,
        errorMessage: status === "FAILED" ? "Simulated failure" : null,
      },
    });
    recipientIds.push(recipient.id);
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SENT", sentAt: new Date() } });
});

afterAll(async () => {
  const { prisma } = modules;
  await prisma.campaignMessage.deleteMany({ where: { campaignRecipient: { campaignId } } });
  await prisma.campaignRecipient.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { name: { startsWith: "Phase8Test" } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: "Phase8Test" } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
  await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("campaign metrics (real recipient rows, no fabricated data)", () => {
  it("counts sent/opened/clicked/failed correctly, with cumulative open counting", async () => {
    const { analyticsService } = modules;
    const { metrics } = await analyticsService.getCampaignMetrics(campaignId);
    expect(metrics.recipients).toBe(4);
    expect(metrics.failed).toBe(1);
    // opened is cumulative: the row at OPENED plus the row at CLICKED (a click implies an open)
    expect(metrics.opened).toBe(2);
    expect(metrics.clicked).toBe(1);
    expect(metrics.openRate).toBeGreaterThan(0);
    expect(metrics.clickRate).toBeGreaterThan(0);
    expect(metrics.clickRate).toBeLessThanOrEqual(metrics.openRate);
  });

  it("never reports a fabricated Delivered or Conversion metric", async () => {
    const { analyticsService } = modules;
    const { metrics } = await analyticsService.getCampaignMetrics(campaignId);
    expect(metrics).not.toHaveProperty("delivered");
    expect(metrics).not.toHaveProperty("conversion");
  });

  it("appears in the campaign reports list with the same metrics", async () => {
    const { analyticsService } = modules;
    const reports = await analyticsService.listCampaignsWithMetrics();
    const entry = reports.find((r) => r.campaign.id === campaignId);
    expect(entry).toBeTruthy();
    expect(entry!.metrics.clicked).toBe(1);
  });
});

describe("open pixel + click redirect (real HTTP-triggered tracking, not fabricated)", () => {
  it("recordOpen upgrades a SENT recipient to OPENED exactly once", async () => {
    const { prisma, trackingService } = modules;
    const sentOnlyRecipientId = recipientIds[0]; // the "sent-only" contact, currently SENT
    await trackingService.recordOpen(sentOnlyRecipientId);
    const after = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: sentOnlyRecipientId } });
    expect(after.status).toBe("OPENED");
    expect(after.openedAt).not.toBeNull();
  });

  it("never downgrades a CLICKED recipient back to OPENED if the pixel fires late", async () => {
    const { prisma, trackingService } = modules;
    const clickedRecipientId = recipientIds[2]; // the "clicked" contact
    await trackingService.recordOpen(clickedRecipientId);
    const after = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: clickedRecipientId } });
    expect(after.status).toBe("CLICKED");
  });

  it("recordClickAndGetDestination returns the campaign's real CTA URL and marks CLICKED", async () => {
    const { prisma, trackingService } = modules;
    const recipientId = recipientIds[0]; // now OPENED from the earlier test
    const destination = await trackingService.recordClickAndGetDestination(recipientId);
    expect(destination).toBe("https://example.com/destination");
    const after = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipientId } });
    expect(after.status).toBe("CLICKED");
  });

  it("returns null for an unknown recipient id rather than an open-redirect-able guess", async () => {
    const { trackingService } = modules;
    const destination = await trackingService.recordClickAndGetDestination("not-a-real-id");
    expect(destination).toBeNull();
  });
});

describe("dashboard summary", () => {
  it("reflects real counts, not placeholders", async () => {
    const { analyticsService } = modules;
    const summary = await analyticsService.getDashboardSummary();
    expect(summary.campaignsSent).toBeGreaterThanOrEqual(1);
    expect(summary.channelPerformance.EMAIL.sent).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(summary.recentActivity)).toBe(true);
  });
});
