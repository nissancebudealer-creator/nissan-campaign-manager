import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROLES = [
  { name: "ADMINISTRATOR", description: "Full system access, including Administration module" },
  { name: "MARKETING_MANAGER", description: "Manage campaigns, contacts, segments, templates, automation" },
  { name: "MARKETING_STAFF", description: "Create and send campaigns; manage contacts" },
  { name: "SALES_MANAGER", description: "View campaigns and contacts; manage own team's leads" },
  { name: "SALES_STAFF", description: "View and update assigned contacts/leads" },
  { name: "VIEWER", description: "Read-only access to dashboards and reports" },
];

// The real, enforced permission set — every key here is checked live by requirePermission(key) on
// an actual route (see middleware/auth.ts and config/permissions.ts), or governs sidebar/route
// module visibility (the view:* keys). This seed just establishes the *starting* grants per role;
// an Administrator can grant or revoke any of these from the Roles tab afterward, and that takes
// effect immediately — this file only runs once (or on a fresh database), it isn't re-applied on
// every deploy in a way that would stomp on an admin's later changes (upsert only creates what's
// missing; it never revokes an existing grant an admin added or removed).
const PERMISSIONS = [
  "contacts:write",
  "contacts:delete",
  "tags:manage",
  "segments:write",
  "segments:delete",
  "templates:write",
  "templates:delete",
  "campaigns:write",
  "campaigns:delete",
  "admin:manage",
  "view:dashboard",
  "view:contacts",
  "view:segments",
  "view:campaigns",
  "view:templates",
  "view:automation",
  "view:reports",
  "view:integrations",
  "view:settings",
  "view:help",
];

const ALL_VIEW = ["view:dashboard", "view:contacts", "view:segments", "view:campaigns", "view:templates", "view:automation", "view:reports", "view:integrations", "view:settings", "view:help"];
const STAFF_VIEW = ["view:dashboard", "view:contacts", "view:segments", "view:campaigns", "view:templates", "view:automation", "view:reports", "view:integrations", "view:help"];
const SALES_VIEW = ["view:dashboard", "view:contacts", "view:reports", "view:help"];
const READ_ONLY_VIEW = ["view:dashboard", "view:reports", "view:help"];

const DEFAULT_GRANTS: Record<string, string[]> = {
  ADMINISTRATOR: PERMISSIONS,
  MARKETING_MANAGER: [
    "contacts:write",
    "contacts:delete",
    "tags:manage",
    "segments:write",
    "segments:delete",
    "templates:write",
    "templates:delete",
    "campaigns:write",
    "campaigns:delete",
    ...STAFF_VIEW,
  ],
  MARKETING_STAFF: ["contacts:write", "tags:manage", "segments:write", "templates:write", "campaigns:write", ...STAFF_VIEW],
  SALES_MANAGER: ["contacts:write", ...SALES_VIEW],
  SALES_STAFF: ["contacts:write", ...SALES_VIEW],
  VIEWER: READ_ONLY_VIEW,
};

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  // Removes permission keys from an earlier, never-enforced version of this seed (e.g.
  // "campaigns:send") that aren't part of the current real set — cascades to any RolePermission
  // rows pointing at them, leaving no orphaned grants for a permission nothing checks anymore.
  await prisma.permission.deleteMany({ where: { key: { notIn: PERMISSIONS } } });

  const roles = await prisma.role.findMany();
  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p]));

  for (const role of roles) {
    const grants = DEFAULT_GRANTS[role.name] ?? [];
    for (const key of grants) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log(`Seeded ${ROLES.length} roles and ${PERMISSIONS.length} permissions with default grants.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
