import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";
import { ROLES, type RoleName } from "../config/roles.js";
import { PERMISSION_LABELS } from "../config/permissions.js";

// One live query per check — no cache to invalidate, no staleness window. A dealership-scale
// app's request volume makes this a non-issue, and "an admin revokes a permission and it applies
// on the very next request" is exactly the real-time behavior a toggle like this implies.
export async function roleHasPermission(role: RoleName, key: string): Promise<boolean> {
  const match = await prisma.rolePermission.findFirst({
    where: { role: { name: role }, permission: { key } },
  });
  return Boolean(match);
}

export async function getPermissionKeysForRole(role: RoleName): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { name: role } },
    select: { permission: { select: { key: true } } },
  });
  return rows.map((r) => r.permission.key);
}

// Every currently-defined permission key, per role — used by the Roles tab matrices. A key with
// no Permission row at all (never seeded) simply can't be granted to anyone, which is a seed bug,
// not a per-role concern, so this only reflects what's actually in the Permission table.
export async function getPermissionMatrix() {
  const [roles, permissions, rolePermissions] = await Promise.all([
    prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { name: "asc" } }),
    prisma.permission.findMany({ orderBy: { key: "asc" } }),
    prisma.rolePermission.findMany({ select: { roleId: true, permissionId: true } }),
  ]);

  const grantedSet = new Set(rolePermissions.map((rp) => `${rp.roleId}:${rp.permissionId}`));

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    userCount: role._count.users,
    permissions: permissions
      .filter((p) => grantedSet.has(`${role.id}:${p.id}`))
      .map((p) => p.key),
  }));
}

// The one hard-coded safety rail: revoking Administration access from the Administrator role
// itself would instantly lock every admin out of the one place that could undo it — the same
// class of problem the last-active-Administrator guard on user accounts already prevents.
function assertNotLockingOutAdministration(roleName: RoleName, permissionKey: string, granted: boolean) {
  if (roleName === ROLES.ADMINISTRATOR && permissionKey === "admin:manage" && !granted) {
    throw new AppError(
      409,
      "Administration access can't be removed from the Administrator role — doing so would lock every admin out of undoing it.",
    );
  }
}

export async function updateRolePermission(
  roleId: string,
  permissionKey: string,
  granted: boolean,
  actorId: string,
) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new AppError(404, "Role not found");

  const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
  if (!permission) throw new AppError(400, "That permission does not exist");

  assertNotLockingOutAdministration(role.name as RoleName, permissionKey, granted);

  if (granted) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: permission.id } },
      update: {},
      create: { roleId, permissionId: permission.id },
    });
  } else {
    await prisma.rolePermission.deleteMany({ where: { roleId, permissionId: permission.id } });
  }

  await recordAudit({
    userId: actorId,
    action: granted ? "ROLE_PERMISSION_GRANTED" : "ROLE_PERMISSION_REVOKED",
    entityType: "Role",
    entityId: roleId,
    metadata: { role: role.name, permission: permissionKey, label: PERMISSION_LABELS[permissionKey] },
  });

  return { roleId, permissionKey, granted };
}
