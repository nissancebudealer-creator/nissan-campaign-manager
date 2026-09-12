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

// What each role can actually do used to be fixed here as hardcoded CAN_* arrays. It's now a real,
// Administrator-editable RolePermission table (see services/permission.service.ts and
// config/permissions.ts for the canonical permission keys) — every route guard queries it live via
// requirePermission(key) in middleware/auth.ts, so a change an admin makes on the Roles tab takes
// effect immediately, not just for future deployments.
