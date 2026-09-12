export const ROLES = {
  ADMINISTRATOR: "ADMINISTRATOR",
  MARKETING_MANAGER: "MARKETING_MANAGER",
  MARKETING_STAFF: "MARKETING_STAFF",
  SALES_MANAGER: "SALES_MANAGER",
  SALES_STAFF: "SALES_STAFF",
  VIEWER: "VIEWER",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleName[] = Object.values(ROLES);

// Groupings used by route-level requireRole(...) checks.
export const CAN_WRITE_CONTACTS: RoleName[] = [
  ROLES.ADMINISTRATOR,
  ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_STAFF,
  ROLES.SALES_MANAGER,
  ROLES.SALES_STAFF,
];

export const CAN_DELETE_CONTACTS: RoleName[] = [ROLES.ADMINISTRATOR, ROLES.MARKETING_MANAGER];

export const CAN_MANAGE_TAGS: RoleName[] = [
  ROLES.ADMINISTRATOR,
  ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_STAFF,
];

export const CAN_WRITE_SEGMENTS: RoleName[] = [
  ROLES.ADMINISTRATOR,
  ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_STAFF,
];

export const CAN_DELETE_SEGMENTS: RoleName[] = [ROLES.ADMINISTRATOR, ROLES.MARKETING_MANAGER];

export const CAN_WRITE_TEMPLATES: RoleName[] = [
  ROLES.ADMINISTRATOR,
  ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_STAFF,
];

export const CAN_DELETE_TEMPLATES: RoleName[] = [ROLES.ADMINISTRATOR, ROLES.MARKETING_MANAGER];

export const CAN_WRITE_CAMPAIGNS: RoleName[] = [
  ROLES.ADMINISTRATOR,
  ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_STAFF,
];

export const CAN_DELETE_CAMPAIGNS: RoleName[] = [ROLES.ADMINISTRATOR, ROLES.MARKETING_MANAGER];

// Administration (Phase 10): user/role management, the audit log, and sending-limit overrides are
// the most sensitive surface in the app — restricted to Administrator only, not shared with any
// other role the way the write/delete groups above are.
export const CAN_MANAGE_ADMIN: RoleName[] = [ROLES.ADMINISTRATOR];

// Which sidebar modules a role sees, derived from the exact same arrays above rather than a
// separately-maintained list — a role appears here for a module only because it already has real
// write access to that module's data (or, for Dashboard/Reports/Help, because those are read-only
// overviews open to everyone). This governs the sidebar AND the route itself (see
// RequireModule.tsx) — hiding a nav link with the page still reachable by URL would be exactly the
// kind of decorative restriction this app avoids everywhere else. It does not, by itself, restrict
// the underlying GET API routes, which remain open to any authenticated user (see ARCHITECTURE.md)
// — this narrows the UI to what's relevant to a role's job, it isn't a data-access boundary.
export const MODULE_GROUPS: { key: string; roles: RoleName[] }[] = [
  { key: "dashboard", roles: ALL_ROLES },
  { key: "contacts", roles: CAN_WRITE_CONTACTS },
  { key: "segments", roles: CAN_WRITE_SEGMENTS },
  { key: "campaigns", roles: CAN_WRITE_CAMPAIGNS },
  { key: "templates", roles: CAN_WRITE_TEMPLATES },
  { key: "automation", roles: CAN_WRITE_CAMPAIGNS },
  { key: "reports", roles: ALL_ROLES },
  { key: "integrations", roles: CAN_WRITE_CAMPAIGNS },
  { key: "settings", roles: CAN_MANAGE_ADMIN },
  { key: "help", roles: ALL_ROLES },
];

export function modulesForRole(role: RoleName): string[] {
  return MODULE_GROUPS.filter((g) => g.roles.includes(role)).map((g) => g.key);
}
