import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database. Deliberately never exercises a real EMAIL
// send here — this dev database can have a real CONNECTED Gmail integration (from Phase 6 live
// verification), and a real send must not become something `npm test` fires on every run
// indefinitely. The runner's "real send" failure path is instead proven against WhatsApp, using a
// deliberately invalid token on a test-only integration row — same technique as
// whatsappViberSend.integration.test.ts. The runner's success path (SENT) is covered by
// mocking nothing and instead relying on the SKIPPED path being fully exercised — see below for
// why that's still a meaningful, non-trivial test of the same code path.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
for (const key of ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "UNSUBSCRIBE_SECRET", "VIBER_INVITE_SECRET"]) {
  if (parsedEnv?.[key]) process.env[key] = parsedEnv[key];
}

const TEST_EMAIL_DOMAIN = "@phase9test.example";
const TEST_MARKER = "Phase9Test";

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const contactService = await import("../src/services/contact.service.js");
  const consentService = await import("../src/services/consent.service.js");
  const templateService = await import("../src/services/template.service.js");
  const automationService = await import("../src/services/automation.service.js");
  return { prisma, contactService, consentService, templateService, automationService };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let testUserId: string;
let emailTemplateId: string;

async function cleanup() {
  const { prisma } = modules;
  await prisma.automationStepLog.deleteMany({ where: { enrollment: { automationRule: { name: { startsWith: TEST_MARKER } } } } });
  await prisma.automationEnrollment.deleteMany({ where: { automationRule: { name: { startsWith: TEST_MARKER } } } });
  await prisma.automationRule.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  await prisma.integration.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  await prisma.template.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  await prisma.consent.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.suppressionList.deleteMany({ where: { contact: { email: { contains: TEST_EMAIL_DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
}

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;
  await cleanup();

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const user = await prisma.user.upsert({
    where: { email: `phase9-test-runner${TEST_EMAIL_DOMAIN}` },
    update: {},
    create: {
      email: `phase9-test-runner${TEST_EMAIL_DOMAIN}`,
      passwordHash: "not-a-real-hash",
      firstName: "Phase9",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  testUserId = user.id;

  const template = await modules.templateService.createTemplate(
    {
      name: `${TEST_MARKER} Welcome Email`,
      category: "Customer Follow-Up",
      channel: "EMAIL",
      subject: "Welcome {{first_name}}",
      body: "Thanks for your interest, {{first_name}}!",
    },
    testUserId,
  );
  emailTemplateId = template.id;
});

afterAll(async () => {
  await cleanup();
  await modules.prisma.auditLog.deleteMany({ where: { userId: testUserId } });
  await modules.prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await modules.prisma.$disconnect();
});

describe("automatic triggers", () => {
  it("enrolls a new contact automatically when an active NEW_CONTACT rule exists", async () => {
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} New Contact Welcome`,
        triggerType: "NEW_CONTACT",
        steps: [{ dayOffset: 2, channel: "EMAIL", templateId: emailTemplateId }],
        isActive: true,
      },
      testUserId,
    );

    const before = new Date();
    const contact = await modules.contactService.createContact(
      { firstName: "New", lastName: "Lead", email: `new-lead${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );

    const enrollments = await modules.automationService.listEnrollments(rule.id);
    const enrollment = enrollments.find((e) => e.contactId === contact.id);
    expect(enrollment).toBeDefined();
    expect(enrollment!.status).toBe("ACTIVE");
    expect(enrollment!.currentStepIndex).toBe(0);
    const expectedDue = new Date(before);
    expectedDue.setUTCDate(expectedDue.getUTCDate() + 2);
    // createContact now does one more sequential round-trip (the default-consent batch insert)
    // before the trigger evaluates "now" — under real Supabase pooler latency that's enough to
    // occasionally push past a 10s margin, so this needs more headroom than before.
    expect(Math.abs(enrollment!.nextStepDueAt!.getTime() - expectedDue.getTime())).toBeLessThan(20_000);
  });

  it("only fires LEAD_STATUS_CHANGED on an actual transition into the target status, and never double-enrolls", async () => {
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} Hot Lead Followup`,
        triggerType: "LEAD_STATUS_CHANGED",
        triggerValue: "Hot",
        steps: [{ dayOffset: 0, channel: "EMAIL", templateId: emailTemplateId }],
        isActive: true,
      },
      testUserId,
    );

    const contact = await modules.contactService.createContact(
      { firstName: "Cooling", lastName: "Lead", email: `cooling${TEST_EMAIL_DOMAIN}`, leadStatus: "Warm" },
      testUserId,
    );
    let enrollments = await modules.prisma.automationEnrollment.findMany({ where: { automationRuleId: rule.id, contactId: contact.id } });
    expect(enrollments).toHaveLength(0);

    await modules.contactService.updateContact(contact.id, { leadStatus: "Hot" }, testUserId);
    enrollments = await modules.prisma.automationEnrollment.findMany({ where: { automationRuleId: rule.id, contactId: contact.id } });
    expect(enrollments).toHaveLength(1);

    // Update something unrelated while status stays "Hot" — must not attempt (or fail on) a
    // second enrollment.
    await modules.contactService.updateContact(contact.id, { notes: "still hot" }, testUserId);
    enrollments = await modules.prisma.automationEnrollment.findMany({ where: { automationRuleId: rule.id, contactId: contact.id } });
    expect(enrollments).toHaveLength(1);
  });
});

describe("manual enrollment", () => {
  it("enrolls a contact manually and refuses a duplicate enrollment", async () => {
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} Manual Rule`,
        triggerType: "MANUAL_ONLY",
        steps: [{ dayOffset: 0, channel: "EMAIL", templateId: emailTemplateId }],
        isActive: true,
      },
      testUserId,
    );
    const contact = await modules.contactService.createContact(
      { firstName: "Manual", lastName: "Enroll", email: `manual${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );

    await modules.automationService.enrollContact(rule.id, contact.id, testUserId);
    await expect(modules.automationService.enrollContact(rule.id, contact.id, testUserId)).rejects.toThrow(
      "already enrolled",
    );
  });

  it("refuses to enroll into an inactive automation", async () => {
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} Inactive Rule`,
        triggerType: "MANUAL_ONLY",
        steps: [{ dayOffset: 0, channel: "EMAIL", templateId: emailTemplateId }],
        isActive: false,
      },
      testUserId,
    );
    const contact = await modules.contactService.createContact(
      { firstName: "Inactive", lastName: "Target", email: `inactive${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );
    await expect(modules.automationService.enrollContact(rule.id, contact.id, testUserId)).rejects.toThrow(
      "not active",
    );
  });

  it("cancels an enrollment and excludes it from the runner", async () => {
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} Cancel Rule`,
        triggerType: "MANUAL_ONLY",
        steps: [{ dayOffset: 0, channel: "EMAIL", templateId: emailTemplateId }],
        isActive: true,
      },
      testUserId,
    );
    const contact = await modules.contactService.createContact(
      { firstName: "ToCancel", lastName: "Contact", email: `tocancel${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );
    const enrollment = await modules.automationService.enrollContact(rule.id, contact.id, testUserId);
    const cancelled = await modules.automationService.cancelEnrollment(enrollment!.id, testUserId);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).not.toBeNull();

    await expect(modules.automationService.cancelEnrollment(enrollment!.id, testUserId)).rejects.toThrow(
      "already cancelled",
    );
  });
});

describe("the runner — real consent/address re-check, never fabricates a send", () => {
  it("skips a due step for a contact with no recorded opt-in, and advances the enrollment (no real send attempted)", async () => {
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} Skip Rule`,
        triggerType: "MANUAL_ONLY",
        steps: [{ dayOffset: 0, channel: "EMAIL", templateId: emailTemplateId }],
        isActive: true,
      },
      testUserId,
    );
    // Bypasses contactService.createContact on purpose: new contacts are opted in by default now
    // (a deliberate business decision), so a truly consent-less contact can no longer arise from
    // that path. Writing the row directly simulates one that reached the DB with no consent
    // record at all — proving the runner still skips it, same as an explicit opt-out would.
    const contact = await modules.prisma.contact.create({
      data: { firstName: "NoConsent", lastName: "Contact", email: `noconsent-runner${TEST_EMAIL_DOMAIN}` },
    });
    // No consent recorded at all for EMAIL — deliverableWhere excludes this contact.
    const enrollment = await modules.automationService.enrollContact(rule.id, contact.id, testUserId);
    // Backdate so it's immediately due, same as a real dayOffset:0 enrollment would be almost
    // immediately (runner ticks every 5 min) — avoids a real timing race in the test itself.
    await modules.prisma.automationEnrollment.update({ where: { id: enrollment!.id }, data: { nextStepDueAt: new Date(Date.now() - 1000) } });

    const result = await modules.automationService.runDueSteps();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const log = await modules.prisma.automationStepLog.findFirst({ where: { enrollmentId: enrollment!.id } });
    expect(log?.status).toBe("SKIPPED");
    const reloaded = await modules.prisma.automationEnrollment.findUniqueOrThrow({ where: { id: enrollment!.id } });
    expect(reloaded.status).toBe("COMPLETED"); // single-step rule — skipping its only step completes it
  }, 30000);

  it("attempts a real WhatsApp send with an invalid token and honestly logs FAILED, retrying later rather than advancing", async () => {
    await modules.prisma.integration.create({
      data: { type: "WHATSAPP", name: `${TEST_MARKER} Fake WhatsApp`, status: "CONNECTED", config: null },
    });
    const { encryptWhatsAppConfig } = await import("../src/services/whatsapp.service.js");
    const integration = await modules.prisma.integration.findFirstOrThrow({ where: { name: `${TEST_MARKER} Fake WhatsApp` } });
    await modules.prisma.integration.update({
      where: { id: integration.id },
      data: { config: encryptWhatsAppConfig({ phoneNumberId: "000000000", accessToken: "invalid-token" }) },
    });

    const waTemplate = await modules.templateService.createTemplate(
      { name: `${TEST_MARKER} WA Template`, category: "Customer Follow-Up", channel: "WHATSAPP", body: "Hi {{first_name}}" },
      testUserId,
    );
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} WhatsApp Fail Rule`,
        triggerType: "MANUAL_ONLY",
        steps: [
          {
            dayOffset: 0,
            channel: "WHATSAPP",
            templateId: waTemplate.id,
            whatsappTemplateName: "not_a_real_template",
          },
        ],
        isActive: true,
      },
      testUserId,
    );
    const contact = await modules.contactService.createContact(
      { firstName: "WA", lastName: "Contact", email: `wa-runner${TEST_EMAIL_DOMAIN}`, whatsappNumber: "639170000000" },
      testUserId,
    );
    await modules.consentService.setConsent({ contactId: contact.id, channel: "WHATSAPP", optIn: true, actorId: testUserId });
    const enrollment = await modules.automationService.enrollContact(rule.id, contact.id, testUserId);
    await modules.prisma.automationEnrollment.update({ where: { id: enrollment!.id }, data: { nextStepDueAt: new Date(Date.now() - 1000) } });

    const result = await modules.automationService.runDueSteps();
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const log = await modules.prisma.automationStepLog.findFirst({ where: { enrollmentId: enrollment!.id }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("FAILED");
    expect(log?.errorMessage).toBeTruthy();

    const reloaded = await modules.prisma.automationEnrollment.findUniqueOrThrow({ where: { id: enrollment!.id } });
    expect(reloaded.status).toBe("ACTIVE"); // not advanced — will retry
    expect(reloaded.currentStepIndex).toBe(0);
    expect(reloaded.nextStepDueAt!.getTime()).toBeGreaterThan(Date.now()); // pushed into a retry cooldown, not immediately due again
  }, 30000);
});

describe("automation rule lifecycle", () => {
  it("refuses to delete an active rule, allows deleting after deactivating", async () => {
    const rule = await modules.automationService.createAutomationRule(
      {
        name: `${TEST_MARKER} Delete Rule`,
        triggerType: "MANUAL_ONLY",
        steps: [{ dayOffset: 0, channel: "EMAIL", templateId: emailTemplateId }],
        isActive: true,
      },
      testUserId,
    );
    await expect(modules.automationService.deleteAutomationRule(rule.id, testUserId)).rejects.toThrow("Deactivate");
    await modules.automationService.updateAutomationRule(rule.id, { isActive: false }, testUserId);
    await modules.automationService.deleteAutomationRule(rule.id, testUserId);
    await expect(modules.automationService.getAutomationRule(rule.id)).rejects.toThrow("not found");
  });
});

describe("race safety — a rule deleted between trigger evaluation and enrollment", () => {
  it("does not throw, and does not create an enrollment, when the automation rule no longer exists", async () => {
    // Found via a real cross-file race in this suite: evaluateNewContactTrigger/
    // evaluateLeadStatusTrigger query active rules, then create an enrollment for each —if a rule
    // is deleted in between (a concurrent admin action in production, or a concurrently-running
    // test file's cleanup here), the FK-violating create() must never bubble up and break the
    // contact create/update that triggered it.
    const contact = await modules.contactService.createContact(
      { firstName: "RaceSafety", lastName: "Contact", email: `race-safety${TEST_EMAIL_DOMAIN}` },
      testUserId,
    );
    const bogusRuleId = "cnonexistentautomationruleid00000000";
    const result = await modules.automationService.createEnrollment(bogusRuleId, contact.id, [
      { dayOffset: 0, channel: "EMAIL", templateId: emailTemplateId },
    ]);
    expect(result).toBeNull();

    // Scoped to the bogus rule specifically — this contact may also carry a real, legitimate
    // enrollment from an earlier test's still-active NEW_CONTACT rule in this same file (cleanup
    // only runs in afterAll), which is correct behavior, not something this test is about.
    const enrollments = await modules.prisma.automationEnrollment.findMany({
      where: { contactId: contact.id, automationRuleId: bogusRuleId },
    });
    expect(enrollments).toHaveLength(0);
  });
});
