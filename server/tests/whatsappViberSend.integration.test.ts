import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database — same pattern as the other integration
// test files. No real WhatsApp/Meta or Viber account is required: the "connected" integrations
// created here use deliberately invalid credentials, so any real send attempt makes a genuine
// network call and gets a genuine rejection from the provider — proving the failure path is
// honest (never fakes a SENT status) without needing real credentials for this phase.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
for (const key of ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "UNSUBSCRIBE_SECRET", "VIBER_INVITE_SECRET"]) {
  if (parsedEnv?.[key]) process.env[key] = parsedEnv[key];
}

const TEST_EMAIL_DOMAIN = "@phase7test.example";
const TEST_MARKER = "Phase7Test";

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const contactService = await import("../src/services/contact.service.js");
  const consentService = await import("../src/services/consent.service.js");
  const segmentService = await import("../src/services/segment.service.js");
  const campaignService = await import("../src/services/campaign.service.js");
  const viberService = await import("../src/services/viber.service.js");
  const tagService = await import("../src/services/tag.service.js");
  return { prisma, contactService, consentService, segmentService, campaignService, viberService, tagService };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let testUserId: string;

async function cleanup() {
  const { prisma } = modules;
  await prisma.campaignRecipient.deleteMany({ where: { campaign: { name: { startsWith: TEST_MARKER } } } });
  await prisma.campaignMessage.deleteMany({ where: { campaignRecipient: { campaign: { name: { startsWith: TEST_MARKER } } } } });
  await prisma.campaign.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  await prisma.integration.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
  await prisma.tag.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
}

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;
  await cleanup();

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const user = await prisma.user.upsert({
    where: { email: `phase7-test-runner${TEST_EMAIL_DOMAIN}` },
    update: {},
    create: {
      email: `phase7-test-runner${TEST_EMAIL_DOMAIN}`,
      passwordHash: "not-a-real-hash",
      firstName: "Phase7",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  testUserId = user.id;
});

afterAll(async () => {
  await cleanup();
  await modules.prisma.auditLog.deleteMany({ where: { userId: testUserId } });
  await modules.prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await modules.prisma.$disconnect();
});

describe("WhatsApp/Viber audience deliverability", () => {
  // Segments are scoped by an exclusive tag rather than a shared field like leadStatus — other
  // test files' fixtures run concurrently and can share values like "Hot"/"Warm", which would
  // make totalMatching/sample flaky (see segments.integration.test.ts for the same concern,
  // solved there with toContain rather than exact counts).
  it("excludes a consented contact with no WhatsApp number, includes one with a number", async () => {
    const tag = await modules.tagService.createTag(`${TEST_MARKER}WhatsAppAddressTag`);
    const withNumber = await modules.contactService.createContact(
      {
        firstName: "HasNumber",
        lastName: "Contact",
        email: `wa-has${TEST_EMAIL_DOMAIN}`,
        whatsappNumber: "639171234567",
        tagIds: [tag.id],
      },
      testUserId,
    );
    const withoutNumber = await modules.contactService.createContact(
      { firstName: "NoNumber", lastName: "Contact", email: `wa-no${TEST_EMAIL_DOMAIN}`, tagIds: [tag.id] },
      testUserId,
    );
    for (const id of [withNumber.id, withoutNumber.id]) {
      await modules.consentService.setConsent({ contactId: id, channel: "WHATSAPP", optIn: true, actorId: testUserId });
    }
    const segment = await modules.segmentService.createSegment(
      {
        name: `${TEST_MARKER} WhatsApp Address Segment`,
        rules: { groups: [{ conditions: [{ field: "tag", operator: "has", value: tag.name }] }] },
      },
      testUserId,
    );

    const preview = await modules.campaignService.previewAudience(segment.id, "WHATSAPP");
    expect(preview.totalMatching).toBe(2);
    expect(preview.noAddressCount).toBe(1);
    expect(preview.estimatedMessages).toBe(1);
    const sampleIds = preview.sample.map((c) => c.id);
    expect(sampleIds).toContain(withNumber.id);
    expect(sampleIds).not.toContain(withoutNumber.id);
  }, 30000); // 6+ sequential round-trips (tag, 2 contacts, 2 consents, segment, preview) — the
  // 20s global default is tight when many test files hit Supabase concurrently in a full run.

  it("excludes a consented contact with no captured Viber user id (not yet subscribed)", async () => {
    const tag = await modules.tagService.createTag(`${TEST_MARKER}ViberAddressTag`);
    const subscribed = await modules.contactService.createContact(
      { firstName: "Subscribed", lastName: "Contact", email: `vb-yes${TEST_EMAIL_DOMAIN}`, tagIds: [tag.id] },
      testUserId,
    );
    await modules.prisma.contact.update({
      where: { id: subscribed.id },
      data: { viberUserId: `viber_${subscribed.id}`, viberSubscribedAt: new Date() },
    });
    const notSubscribed = await modules.contactService.createContact(
      { firstName: "NotSubscribed", lastName: "Contact", email: `vb-no${TEST_EMAIL_DOMAIN}`, tagIds: [tag.id] },
      testUserId,
    );
    for (const id of [subscribed.id, notSubscribed.id]) {
      await modules.consentService.setConsent({ contactId: id, channel: "VIBER", optIn: true, actorId: testUserId });
    }
    const segment = await modules.segmentService.createSegment(
      {
        name: `${TEST_MARKER} Viber Address Segment`,
        rules: { groups: [{ conditions: [{ field: "tag", operator: "has", value: tag.name }] }] },
      },
      testUserId,
    );

    const preview = await modules.campaignService.previewAudience(segment.id, "VIBER");
    expect(preview.totalMatching).toBe(2);
    expect(preview.noAddressCount).toBe(1);
    expect(preview.estimatedMessages).toBe(1);
    const sampleIds = preview.sample.map((c) => c.id);
    expect(sampleIds).toContain(subscribed.id);
    expect(sampleIds).not.toContain(notSubscribed.id);
  }, 30000);
});

describe("WhatsApp send gating", () => {
  it("refuses to send a WhatsApp campaign with no template configured, without attempting any send", async () => {
    await modules.prisma.integration.create({
      data: { type: "WHATSAPP", name: `${TEST_MARKER} Fake WhatsApp`, status: "CONNECTED", config: null },
    });
    // Scoped by an exclusive tag rather than a shared field like leadStatus — a real contact in
    // this shared dev database can legitimately have leadStatus "Hot"/"Cold" too, which would
    // pull them into this segment and inflate the recipient count (see the sibling describe
    // block's comment above for the original version of this lesson).
    const tag = await modules.tagService.createTag(`${TEST_MARKER}NoTemplateTag`);
    const contact = await modules.contactService.createContact(
      {
        firstName: "Template",
        lastName: "Missing",
        email: `wa-tmpl${TEST_EMAIL_DOMAIN}`,
        whatsappNumber: "639171111111",
        tagIds: [tag.id],
      },
      testUserId,
    );
    await modules.consentService.setConsent({ contactId: contact.id, channel: "WHATSAPP", optIn: true, actorId: testUserId });
    const segment = await modules.segmentService.createSegment(
      {
        name: `${TEST_MARKER} No Template Segment`,
        rules: { groups: [{ conditions: [{ field: "tag", operator: "has", value: tag.name }] }] },
      },
      testUserId,
    );
    const campaign = await modules.campaignService.createCampaign(
      {
        name: `${TEST_MARKER} No Template Campaign`,
        type: "New Vehicle Promotion",
        channel: "WHATSAPP",
        segmentId: segment.id,
        message: "Hi {{first_name}}",
      },
      testUserId,
    );

    await expect(modules.campaignService.requestSend(campaign.id, testUserId, { testMode: false })).rejects.toThrow(
      /template/i,
    );

    const reloaded = await modules.prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(reloaded.status).not.toBe("SENDING");
  }, 30000); // no real network call happens here, but the tight 20s default has been observed to
  // flake under full-suite load — same reasoning as the sibling tests' explicit timeouts below.

  it("attempts a real send with an invalid token and honestly records it as FAILED, never fabricating SENT", async () => {
    const integration = await modules.prisma.integration.findFirstOrThrow({
      where: { type: "WHATSAPP", name: `${TEST_MARKER} Fake WhatsApp` },
    });
    const { encryptWhatsAppConfig } = await import("../src/services/whatsapp.service.js");
    await modules.prisma.integration.update({
      where: { id: integration.id },
      data: { config: encryptWhatsAppConfig({ phoneNumberId: "000000000", accessToken: "invalid-token" }) },
    });

    // Scoped by an exclusive tag, not leadStatus — same reasoning as the "No Template" test above.
    const tag = await modules.tagService.createTag(`${TEST_MARKER}RealAttemptTag`);
    const contact = await modules.contactService.createContact(
      {
        firstName: "RealAttempt",
        lastName: "Contact",
        email: `wa-real${TEST_EMAIL_DOMAIN}`,
        whatsappNumber: "639172222222",
        tagIds: [tag.id],
      },
      testUserId,
    );
    await modules.consentService.setConsent({ contactId: contact.id, channel: "WHATSAPP", optIn: true, actorId: testUserId });
    const segment = await modules.segmentService.createSegment(
      {
        name: `${TEST_MARKER} Real Attempt Segment`,
        rules: { groups: [{ conditions: [{ field: "tag", operator: "has", value: tag.name }] }] },
      },
      testUserId,
    );
    const campaign = await modules.campaignService.createCampaign(
      {
        name: `${TEST_MARKER} Real Attempt Campaign`,
        type: "New Vehicle Promotion",
        channel: "WHATSAPP",
        segmentId: segment.id,
        message: "Hi {{first_name}}",
        whatsappTemplateName: "not_a_real_template",
      },
      testUserId,
    );

    const result = await modules.campaignService.requestSend(campaign.id, testUserId, { testMode: false });
    expect(result).toMatchObject({ sentCount: 0, failedCount: 1 });

    const recipient = await modules.prisma.campaignRecipient.findFirstOrThrow({
      where: { campaignId: campaign.id, contactId: contact.id },
    });
    expect(recipient.status).toBe("FAILED");
    expect(recipient.errorMessage).toBeTruthy();

    const reloaded = await modules.prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(reloaded.status).toBe("FAILED");
  }, 45000); // a real outbound call to Meta's Graph API, competing with 12+ other test files
  // hammering Supabase concurrently, plus the pacing/DNS-lookup latency added elsewhere today —
  // occasionally exceeded even 30s under full-suite load.

  it("caps a send to batchSize, stays resumable (SENDING) with an accurate remaining count, and picks up the rest on the next call", async () => {
    const { prisma, campaignService, contactService, consentService, tagService } = modules;

    const integration = await prisma.integration.findFirstOrThrow({
      where: { type: "WHATSAPP", name: `${TEST_MARKER} Fake WhatsApp` },
    });
    const { encryptWhatsAppConfig } = await import("../src/services/whatsapp.service.js");
    await prisma.integration.update({
      where: { id: integration.id },
      data: { config: encryptWhatsAppConfig({ phoneNumberId: "000000000", accessToken: "invalid-token" }) },
    });

    const tag = await tagService.createTag(`${TEST_MARKER}BatchTag`);
    const contacts = await Promise.all(
      [1, 2, 3].map((n) =>
        contactService.createContact(
          {
            firstName: `Batch${n}`,
            lastName: "Contact",
            email: `wa-batch${n}${TEST_EMAIL_DOMAIN}`,
            whatsappNumber: `63917000000${n}`,
            tagIds: [tag.id],
          },
          testUserId,
        ),
      ),
    );
    for (const c of contacts) {
      await consentService.setConsent({ contactId: c.id, channel: "WHATSAPP", optIn: true, actorId: testUserId });
    }
    const segment = await modules.segmentService.createSegment(
      {
        name: `${TEST_MARKER} Batch Segment`,
        rules: { groups: [{ conditions: [{ field: "tag", operator: "has", value: tag.name }] }] },
      },
      testUserId,
    );
    const campaign = await campaignService.createCampaign(
      {
        name: `${TEST_MARKER} Batch Campaign`,
        type: "New Vehicle Promotion",
        channel: "WHATSAPP",
        segmentId: segment.id,
        message: "Hi {{first_name}}",
        whatsappTemplateName: "not_a_real_template",
      },
      testUserId,
    );

    // First batch: only 2 of the 3 eligible contacts should even be attempted.
    const firstBatch = await campaignService.requestSend(campaign.id, testUserId, { testMode: false, batchSize: 2 });
    expect(firstBatch).toMatchObject({ sentCount: 0, failedCount: 2, remainingCount: 1 });

    const afterFirstBatch = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(afterFirstBatch.status).toBe("SENDING"); // resumable, not a terminal outcome

    const recipientsAfterFirstBatch = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
    expect(recipientsAfterFirstBatch).toHaveLength(2); // the untouched 3rd contact has no row yet

    // getCampaign should report the same remaining count independently, without relying on the
    // send response — this is what the UI reads after a page reload.
    const reloadedCampaign = await campaignService.getCampaign(campaign.id);
    expect(reloadedCampaign.remainingCount).toBe(1);
    expect(reloadedCampaign.sentCount).toBe(0);

    // Second call, no batchSize: resumes with only the 1 never-touched contact — a FAILED
    // recipient is a real, completed attempt, not silently retried by a later call.
    const secondBatch = await campaignService.requestSend(campaign.id, testUserId, { testMode: false });
    expect(secondBatch).toMatchObject({ sentCount: 0, failedCount: 1, remainingCount: 0 });

    const afterSecondBatch = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(afterSecondBatch.status).toBe("FAILED"); // now genuinely terminal — nothing ever sent

    const recipientsAfterSecondBatch = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
    expect(recipientsAfterSecondBatch).toHaveLength(3);
    expect(recipientsAfterSecondBatch.every((r) => r.status === "FAILED")).toBe(true);
  }, 90000); // 3 real outbound Meta API attempts total across both batches (each historically
  // 15-25s alone per this file's other real-send tests), plus SEND_DELAY_MS pacing between each
  // (raised from 250ms to 1200ms fixing a real Gmail rate-limit issue, and applied to every
  // channel's send loop, not just Gmail) and a real DNS lookup on each of the 3 contacts created —
  // competing with the rest of the suite hammering Supabase concurrently.
  // rest of the suite hammering Supabase concurrently.
});

describe("Viber webhook subscriber attribution", () => {
  it("attributes a real Viber user id to the contact that generated the invite link", async () => {
    const contact = await modules.contactService.createContact(
      { firstName: "Invite", lastName: "Target", email: `vb-invite${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );
    const link = modules.viberService.buildViberInviteLink("nissantest", contact.id);
    const context = new URL(link.replace("viber://", "https://")).searchParams.get("context")!;

    await modules.viberService.handleWebhookEvent({
      event: "conversation_started",
      context,
      user: { id: "viber_real_user_123" },
    });

    const reloaded = await modules.prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(reloaded.viberUserId).toBe("viber_real_user_123");
    expect(reloaded.viberSubscribedAt).not.toBeNull();
  });

  it("ignores an event with a forged/unrecognized context rather than attributing it to any contact", async () => {
    const contact = await modules.contactService.createContact(
      { firstName: "Untouched", lastName: "Contact", email: `vb-untouched${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );
    await modules.viberService.handleWebhookEvent({
      event: "conversation_started",
      context: "forged-context-value",
      user: { id: "viber_should_not_attach" },
    });
    const reloaded = await modules.prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(reloaded.viberUserId).toBeNull();
  });

  it("clears viberUserId when the contact unsubscribes", async () => {
    const contact = await modules.contactService.createContact(
      { firstName: "WillUnsub", lastName: "Contact", email: `vb-unsub${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );
    await modules.prisma.contact.update({
      where: { id: contact.id },
      data: { viberUserId: "viber_unsub_target", viberSubscribedAt: new Date() },
    });

    await modules.viberService.handleWebhookEvent({
      event: "unsubscribed",
      user: { id: "viber_unsub_target" },
    });

    const reloaded = await modules.prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(reloaded.viberUserId).toBeNull();
    expect(reloaded.viberSubscribedAt).toBeNull();
  });
});
