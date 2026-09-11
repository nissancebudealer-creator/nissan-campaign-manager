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
