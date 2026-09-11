import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests against the real Supabase database. Two things are deliberately NOT covered
// by an automated test here, both for the same reason Phase 8 never automated a real Gmail send:
// the only safe way to exercise them would touch real, currently-in-use production data in this
// shared dev database.
//   1. The "would orphan the last Administrator" refusal — this dev database currently has
//      exactly one real active Administrator (the user's own account). Proving the block fires
//      would require deactivating that real account, even briefly. Instead we prove the guard's
//      *permissive* path: deactivating a test-created Administrator is correctly allowed when a
//      real one still remains active, which is the actual code path most updates take.
//   2. Updating the real, currently-CONNECTED Gmail integration's sending limit — tested instead
//      against a disposable, deliberately-invalid-credentialed test integration (same technique
//      already used for WhatsApp/Viber in Phase 7/9's test suites).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
for (const key of ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "UNSUBSCRIBE_SECRET", "VIBER_INVITE_SECRET"]) {
  if (parsedEnv?.[key]) process.env[key] = parsedEnv[key];
}

const TEST_EMAIL_DOMAIN = "@phase10test.example";
const TEST_MARKER = "Phase10Test";

async function loadModules() {
  const { prisma } = await import("../src/lib/prisma.js");
  const adminService = await import("../src/services/admin.service.js");
  const authService = await import("../src/services/auth.service.js");
  return { prisma, adminService, authService };
}

let modules: Awaited<ReturnType<typeof loadModules>>;
let actorId: string;
let viewerRoleId: string;
let administratorRoleId: string;

async function cleanup() {
  const { prisma } = modules;
  await prisma.integration.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  // audit_logs.userId is ON DELETE SET NULL — deleting these test users leaves their real audit
  // trail intact (nulled out, not deleted), which is correct: audit history is a permanent record,
  // not something tests should scrub.
  await prisma.user.deleteMany({ where: { email: { contains: TEST_EMAIL_DOMAIN } } });
}

beforeAll(async () => {
  modules = await loadModules();
  const { prisma } = modules;
  await cleanup();

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  administratorRoleId = role.id;
  const viewerRole = await prisma.role.findUniqueOrThrow({ where: { name: "VIEWER" } });
  viewerRoleId = viewerRole.id;

  const actor = await prisma.user.upsert({
    where: { email: `phase10-test-runner${TEST_EMAIL_DOMAIN}` },
    update: {},
    create: {
      email: `phase10-test-runner${TEST_EMAIL_DOMAIN}`,
      passwordHash: "not-a-real-hash",
      firstName: "Phase10",
      lastName: "TestRunner",
      roleId: role.id,
    },
  });
  actorId = actor.id;
});

afterAll(async () => {
  await cleanup();
  await modules.prisma.$disconnect();
});

describe("user management", () => {
  it("creates a user, refuses a duplicate email, and lists real users", async () => {
    const user = await modules.adminService.createUser(
      {
        email: `new-user${TEST_EMAIL_DOMAIN}`,
        password: "a-real-password-123",
        firstName: "New",
        lastName: "User",
        roleId: viewerRoleId,
      },
      actorId,
    );
    expect(user.email).toBe(`new-user${TEST_EMAIL_DOMAIN}`);
    expect(user.role.name).toBe("VIEWER");

    await expect(
      modules.adminService.createUser(
        { email: `new-user${TEST_EMAIL_DOMAIN}`, password: "another-password-123", firstName: "Dup", lastName: "User", roleId: viewerRoleId },
        actorId,
      ),
    ).rejects.toThrow("already exists");

    const users = await modules.adminService.listUsers();
    expect(users.some((u) => u.id === user.id)).toBe(true);
  });

  it("updates a non-administrator's role and active status without being blocked by the orphan guard", async () => {
    const user = await modules.adminService.createUser(
      { email: `to-update${TEST_EMAIL_DOMAIN}`, password: "a-real-password-123", firstName: "ToUpdate", lastName: "User", roleId: viewerRoleId },
      actorId,
    );
    const updated = await modules.adminService.updateUser(user.id, { isActive: false }, actorId);
    expect(updated.isActive).toBe(false);
  });

  it("allows deactivating a test-created Administrator when a real Administrator remains active", async () => {
    const tempAdmin = await modules.adminService.createUser(
      { email: `temp-admin${TEST_EMAIL_DOMAIN}`, password: "a-real-password-123", firstName: "Temp", lastName: "Admin", roleId: administratorRoleId },
      actorId,
    );
    // Not orphaning anyone: the real account this dev database is actually used with stays
    // untouched and active throughout — only this disposable test admin is deactivated.
    const updated = await modules.adminService.updateUser(tempAdmin.id, { isActive: false }, actorId);
    expect(updated.isActive).toBe(false);
  });

  it("resets a user's password — the old password stops working, the new one works", async () => {
    const email = `pw-reset${TEST_EMAIL_DOMAIN}`;
    await modules.authService.registerUser({ email, password: "original-password-1", firstName: "Pw", lastName: "Reset" });
    const user = await modules.prisma.user.findUniqueOrThrow({ where: { email } });

    await modules.adminService.resetUserPassword(user.id, "brand-new-password-1", actorId);

    await expect(modules.authService.loginUser({ email, password: "original-password-1" })).rejects.toThrow();
    const result = await modules.authService.loginUser({ email, password: "brand-new-password-1" });
    expect(result.user.email).toBe(email);
  });
});

describe("roles — real, computed grants (not the inert Permission/RolePermission seed data)", () => {
  it("VIEWER has no write/delete/admin grants; ADMINISTRATOR has all of them", async () => {
    const roles = await modules.adminService.listRoles();
    const viewer = roles.find((r) => r.name === "VIEWER")!;
    const administrator = roles.find((r) => r.name === "ADMINISTRATOR")!;
    expect(viewer.grants).toEqual([]);
    expect(administrator.grants.length).toBeGreaterThan(0);
    expect(administrator.grants).toContain("Administration");
  });
});

describe("audit log", () => {
  it("records and lists a real USER_CREATED entry for an action taken above", async () => {
    const result = await modules.adminService.listAuditLogs({
      action: "USER_CREATED",
      entityType: "User",
      page: 1,
      pageSize: 50,
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.logs.every((log) => log.action === "USER_CREATED")).toBe(true);
  });
});

describe("sending limits", () => {
  it("reports a channel with no connected integration as unconnected, using its documented default", async () => {
    const limits = await modules.adminService.getSendingLimits();
    const unconnected = limits.find((l) => !l.connected);
    expect(unconnected).toBeDefined();
    expect(unconnected!.dailyLimit).toBeNull();
    expect(unconnected!.defaultDailyLimit).toBeGreaterThan(0);
  });

  it("refuses to set a limit on a channel with no connected integration", async () => {
    const limits = await modules.adminService.getSendingLimits();
    const unconnectedType = limits.find((l) => !l.connected)!.type;
    await expect(modules.adminService.updateSendingLimit(unconnectedType, 500, actorId)).rejects.toThrow(
      "No connected",
    );
  });

  it("actually changes the stored daily limit on a connected (test) integration", async () => {
    const { encryptWhatsAppConfig } = await import("../src/services/whatsapp.service.js");
    await modules.prisma.integration.create({
      data: {
        type: "WHATSAPP",
        name: `${TEST_MARKER} Fake WhatsApp`,
        status: "CONNECTED",
        config: encryptWhatsAppConfig({ phoneNumberId: "000000000", accessToken: "invalid-token" }),
      },
    });

    await modules.adminService.updateSendingLimit("WHATSAPP", 777, actorId);

    const limits = await modules.adminService.getSendingLimits();
    const whatsapp = limits.find((l) => l.type === "WHATSAPP")!;
    expect(whatsapp.connected).toBe(true);
    expect(whatsapp.dailyLimit).toBe(777);
  });
});
