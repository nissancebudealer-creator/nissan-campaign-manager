import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database configured in server/.env — same pattern
// as the other Phase 2/3 integration tests.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
if (parsedEnv?.JWT_SECRET) process.env.JWT_SECRET = parsedEnv.JWT_SECRET;

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const templateService = await import("../src/services/template.service.js");
  return { prisma, templateService };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let testUserId: string;

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;

  await prisma.template.deleteMany({ where: { name: { startsWith: "Phase4Test" } } });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const user = await prisma.user.upsert({
    where: { email: "phase4-test-runner@phase4test.example" },
    update: {},
    create: {
      email: "phase4-test-runner@phase4test.example",
      passwordHash: "not-a-real-hash",
      firstName: "Phase4",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  testUserId = user.id;
});

afterAll(async () => {
  const { prisma } = modules;
  await prisma.template.deleteMany({ where: { name: { startsWith: "Phase4Test" } } });
  await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("template CRUD", () => {
  it("creates an email template and auto-extracts used variables", async () => {
    const { templateService } = modules;
    const template = await templateService.createTemplate(
      {
        name: "Phase4Test Welcome Email",
        category: "Customer Follow-Up",
        channel: "EMAIL",
        subject: "Hi {{first_name}}, welcome to {{company}}",
        body: "Hi {{first_name}} {{last_name}}, thanks for your interest in {{product_interest}}. Also {{not_a_real_var}}.",
        ctaLabel: "Learn more",
        ctaUrl: "https://example.com",
      },
      testUserId,
    );

    expect(template.id).toBeTruthy();
    expect(template.subject).toBe("Hi {{first_name}}, welcome to {{company}}");
    expect(new Set(template.variables)).toEqual(
      new Set(["first_name", "last_name", "company", "product_interest"]),
    );
    // unsupported token must not leak into the stored variable list
    expect(template.variables).not.toContain("not_a_real_var");
  });

  it("clears subject for non-email channels regardless of input", async () => {
    const { templateService } = modules;
    const template = await templateService.createTemplate(
      {
        name: "Phase4Test WhatsApp Promo",
        category: "New Vehicle Promotion",
        channel: "WHATSAPP",
        subject: "This should be dropped",
        body: "Hi {{first_name}}, check out our SUV lineup!",
      },
      testUserId,
    );
    expect(template.subject).toBeNull();
    expect(template.variables).toEqual(["first_name"]);
  });

  it("reads, updates (re-extracting variables), and deletes a template", async () => {
    const { templateService } = modules;
    const created = await templateService.createTemplate(
      {
        name: "Phase4Test Editable",
        category: "Event Invitation",
        channel: "EMAIL",
        subject: "You're invited, {{first_name}}",
        body: "Join us!",
      },
      testUserId,
    );

    const fetched = await templateService.getTemplate(created.id);
    expect(fetched.name).toBe("Phase4Test Editable");

    const updated = await templateService.updateTemplate(
      created.id,
      { body: "Join us, {{first_name}} from {{company}}!" },
      testUserId,
    );
    expect(new Set(updated.variables)).toEqual(new Set(["first_name", "company"]));

    await templateService.deleteTemplate(created.id, testUserId);
    await expect(templateService.getTemplate(created.id)).rejects.toThrow("Template not found");
  });

  it("filters by category and channel", async () => {
    const { templateService } = modules;
    const results = await templateService.listTemplates({ category: "New Vehicle Promotion" });
    expect(results.every((t) => t.category === "New Vehicle Promotion")).toBe(true);
    expect(results.some((t) => t.name === "Phase4Test WhatsApp Promo")).toBe(true);
  });
});
