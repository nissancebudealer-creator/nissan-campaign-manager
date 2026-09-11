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

const PERMISSIONS = [
  "contacts:read",
  "contacts:write",
  "contacts:delete",
  "campaigns:read",
  "campaigns:write",
  "campaigns:send",
  "templates:read",
  "templates:write",
  "segments:read",
  "segments:write",
  "reports:read",
  "admin:manage",
];

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

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMINISTRATOR" } });
  const allPermissions = await prisma.permission.findMany();
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    });
  }

  console.log(`Seeded ${ROLES.length} roles and ${PERMISSIONS.length} permissions.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
