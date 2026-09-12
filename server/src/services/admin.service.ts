import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { hashPassword } from "../utils/password.js";
import { recordAudit } from "./audit.service.js";
import { ROLES } from "../config/roles.js";
import { getPermissionMatrix, updateRolePermission as updateRolePermissionReal } from "./permission.service.js";
import { readGmailConfig, encryptGmailConfig } from "./gmailAuth.service.js";
import { readWhatsAppConfig, encryptWhatsAppConfig } from "./whatsapp.service.js";
import { readViberConfig, encryptViberConfig } from "./viber.service.js";
import { DEFAULT_DAILY_LIMIT as GMAIL_DEFAULT_DAILY_LIMIT } from "../config/gmailLimits.js";
import {
  WHATSAPP_DEFAULT_DAILY_LIMIT,
  VIBER_DEFAULT_DAILY_LIMIT,
} from "../config/messagingLimits.js";

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
};

export function listUsers() {
  return prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } });
}

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleId: string;
}

export async function createUser(input: CreateUserInput, actorId: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, "An account with this email already exists");

  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new AppError(400, "That role does not exist");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      roleId: input.roleId,
    },
    select: userSelect,
  });

  await recordAudit({
    userId: actorId,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email, role: role.name },
  });
  return user;
}

// A change that would leave zero active Administrators is refused outright — there would be no
// one left who could undo it. Checked against the state *after* applying the proposed change.
async function assertWouldNotOrphanAdmin(targetUserId: string, nextRoleId: string | undefined, nextIsActive: boolean | undefined) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, include: { role: true } });
  if (!target) throw new AppError(404, "User not found");
  if (target.role.name !== ROLES.ADMINISTRATOR) return; // only administrators can orphan the seat

  const roleChanging = nextRoleId !== undefined && nextRoleId !== target.roleId;
  const becomingInactive = nextIsActive === false;
  if (!roleChanging && !becomingInactive) return;

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: ROLES.ADMINISTRATOR } });
  const otherActiveAdmins = await prisma.user.count({
    where: { roleId: adminRole.id, isActive: true, id: { not: targetUserId } },
  });
  if (otherActiveAdmins === 0) {
    throw new AppError(
      409,
      "This is the only active Administrator — promote another user to Administrator before changing this account, so the system is never left without one.",
    );
  }
}

interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  roleId?: string;
  isActive?: boolean;
}

export async function updateUser(id: string, input: UpdateUserInput, actorId: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "User not found");

  if (input.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw new AppError(400, "That role does not exist");
  }

  await assertWouldNotOrphanAdmin(id, input.roleId, input.isActive);

  const user = await prisma.user.update({
    where: { id },
    data: { firstName: input.firstName, lastName: input.lastName, roleId: input.roleId, isActive: input.isActive },
    select: userSelect,
  });

  await recordAudit({
    userId: actorId,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: id,
    metadata: { ...input },
  });
  return user;
}

// Permanent removal — distinct from updateUser's isActive:false deactivation, and more
// destructive: anything this user created (contacts, campaigns, templates, segments, automation
// rules) is NOT deleted along with them — createdById is set to null on those rows, the same
// treatment AuditLog.userId already gets, so real business data never disappears just because the
// account that made it is gone.
export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) {
    throw new AppError(409, "You can't delete your own account while signed in as it.");
  }
  const existing = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!existing) throw new AppError(404, "User not found");

  await assertWouldNotOrphanAdmin(id, undefined, false);

  await prisma.user.delete({ where: { id } });
  await recordAudit({
    userId: actorId,
    action: "USER_DELETED",
    entityType: "User",
    entityId: id,
    metadata: { email: existing.email, name: `${existing.firstName} ${existing.lastName}`, role: existing.role.name },
  });
}

export async function resetUserPassword(id: string, password: string, actorId: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "User not found");

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  await recordAudit({ userId: actorId, action: "USER_PASSWORD_RESET", entityType: "User", entityId: id });
}

// ---------- Roles & (real, enforced, admin-editable) permissions ----------
// Permission/RolePermission are no longer inert seed data — every route guard queries them live
// via requirePermission(key) (middleware/auth.ts), and this is the same data the Roles tab reads
// and, through updateRolePermission below, writes. See config/permissions.ts for the canonical
// key list and services/permission.service.ts for the query/mutation logic.
export async function listRoles() {
  return getPermissionMatrix();
}

export async function updateRolePermission(
  roleId: string,
  permissionKey: string,
  granted: boolean,
  actorId: string,
) {
  return updateRolePermissionReal(roleId, permissionKey, granted, actorId);
}

// ---------- Audit log ----------

interface AuditLogQuery {
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listAuditLogs(query: AuditLogQuery) {
  const where = {
    action: query.action || undefined,
    entityType: query.entityType || undefined,
    userId: query.userId || undefined,
    createdAt:
      query.from || query.to
        ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
        : undefined,
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total, page: query.page, pageSize: query.pageSize };
}

// ---------- Sending limits ----------
// The actual dailyLimit override already existed per-channel since Phase 6-7 (a field inside each
// integration's encrypted config, read with a fallback to the provider's documented default) —
// this just gives an admin a real way to change it, instead of it being permanently fixed at the
// conservative default with no path to raise it once a provider actually confirms a higher tier.

interface SendingLimitRow {
  type: "GMAIL" | "WHATSAPP" | "VIBER";
  connected: boolean;
  dailyLimit: number | null;
  defaultDailyLimit: number;
  sentToday: number | null;
}

export async function getSendingLimits(): Promise<SendingLimitRow[]> {
  const integrations = await prisma.integration.findMany({
    where: { type: { in: ["GMAIL", "WHATSAPP", "VIBER"] } },
  });
  const byType = new Map(integrations.map((i) => [i.type, i]));

  const rows: SendingLimitRow[] = [];
  for (const type of ["GMAIL", "WHATSAPP", "VIBER"] as const) {
    const integration = byType.get(type);
    if (!integration || integration.status !== "CONNECTED" || !integration.config) {
      rows.push({
        type,
        connected: false,
        dailyLimit: null,
        defaultDailyLimit: DEFAULTS[type],
        sentToday: null,
      });
      continue;
    }
    const config = readConfig(type, integration.config as string);
    rows.push({
      type,
      connected: true,
      dailyLimit: config.dailyLimit ?? DEFAULTS[type],
      defaultDailyLimit: DEFAULTS[type],
      sentToday: sentTodayIfCurrent(config),
    });
  }
  return rows;
}

const DEFAULTS = {
  GMAIL: GMAIL_DEFAULT_DAILY_LIMIT,
  WHATSAPP: WHATSAPP_DEFAULT_DAILY_LIMIT,
  VIBER: VIBER_DEFAULT_DAILY_LIMIT,
};

function readConfig(type: "GMAIL" | "WHATSAPP" | "VIBER", raw: string) {
  if (type === "GMAIL") return readGmailConfig(raw);
  if (type === "WHATSAPP") return readWhatsAppConfig(raw);
  return readViberConfig(raw);
}

function sentTodayIfCurrent(config: { sentToday?: number; sentTodayDate?: string }): number | null {
  const today = new Date().toISOString().slice(0, 10);
  if (config.sentTodayDate !== today) return 0;
  return config.sentToday ?? 0;
}

export async function updateSendingLimit(type: "GMAIL" | "WHATSAPP" | "VIBER", dailyLimit: number, actorId: string) {
  const integration = await prisma.integration.findFirst({ where: { type, status: "CONNECTED" } });
  if (!integration || !integration.config) {
    throw new AppError(409, `No connected ${type} integration to set a limit on.`);
  }

  let nextConfig: string;
  if (type === "GMAIL") {
    const config = readGmailConfig(integration.config as string);
    nextConfig = encryptGmailConfig({ ...config, dailyLimit });
  } else if (type === "WHATSAPP") {
    const config = readWhatsAppConfig(integration.config as string);
    nextConfig = encryptWhatsAppConfig({ ...config, dailyLimit });
  } else {
    const config = readViberConfig(integration.config as string);
    nextConfig = encryptViberConfig({ ...config, dailyLimit });
  }

  await prisma.integration.update({ where: { id: integration.id }, data: { config: nextConfig } });
  await recordAudit({
    userId: actorId,
    action: "SENDING_LIMIT_UPDATED",
    entityType: "Integration",
    entityId: integration.id,
    metadata: { type, dailyLimit },
  });
}
