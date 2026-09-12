// The canonical, real permission keys — every one of these is actually checked by a route guard
// (requirePermission(key) in middleware/auth.ts) or governs sidebar/route module visibility. This
// replaces the old hardcoded CAN_* role arrays: instead of "which roles can write a campaign" being
// fixed in code, it's now a live RolePermission row an Administrator can grant or revoke from the
// Roles tab, and every check reads that row fresh — a toggle here has real, immediate effect.
export const WRITE_PERMISSION_KEYS = [
  "contacts:write",
  "contacts:delete",
  "tags:manage",
  "segments:write",
  "segments:delete",
  "templates:write",
  "templates:delete",
  "campaigns:write", // also covers automation write/send — see automation.routes.ts
  "campaigns:delete",
  "admin:manage",
] as const;

// Governs both the sidebar link and the route itself (RequireModule.tsx on the frontend) — kept
// as its own dimension from the write/delete keys above so a role can see a module read-only
// without necessarily being able to change anything in it.
export const VIEW_PERMISSION_KEYS = [
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
] as const;

export const ALL_PERMISSION_KEYS = [...WRITE_PERMISSION_KEYS, ...VIEW_PERMISSION_KEYS];

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<string, string> = {
  "contacts:write": "Write contacts",
  "contacts:delete": "Delete contacts",
  "tags:manage": "Manage tags",
  "segments:write": "Write segments",
  "segments:delete": "Delete segments",
  "templates:write": "Write templates",
  "templates:delete": "Delete templates",
  "campaigns:write": "Write campaigns (incl. automation)",
  "campaigns:delete": "Delete campaigns",
  "admin:manage": "Administration",
  "view:dashboard": "Dashboard",
  "view:contacts": "Contacts",
  "view:segments": "Segments",
  "view:campaigns": "Campaigns",
  "view:templates": "Templates",
  "view:automation": "Automation",
  "view:reports": "Reports",
  "view:integrations": "Integrations",
  "view:settings": "Settings",
  "view:help": "Help",
};

// The module key a `view:*` permission maps to in the frontend sidebar/route guard.
export function moduleKeyFromViewPermission(key: string): string | null {
  return key.startsWith("view:") ? key.slice("view:".length) : null;
}
