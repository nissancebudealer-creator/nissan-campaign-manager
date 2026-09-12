import { api } from "./api";
import type { AdminRole, AdminUser, AdminUserInput, AuditLogResponse, SendingLimitRow } from "../types";

export interface AuditLogQuery {
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

export const adminApi = {
  listUsers: () => api.get<{ users: AdminUser[] }>("/admin/users"),
  createUser: (input: AdminUserInput) => api.post<{ user: AdminUser }>("/admin/users", input),
  updateUser: (id: string, input: Partial<Pick<AdminUserInput, "firstName" | "lastName" | "roleId">> & { isActive?: boolean }) =>
    api.put<{ user: AdminUser }>(`/admin/users/${id}`, input),
  resetPassword: (id: string, password: string) => api.post<void>(`/admin/users/${id}/reset-password`, { password }),
  deleteUser: (id: string) => api.delete<void>(`/admin/users/${id}`),

  listRoles: () => api.get<{ roles: AdminRole[] }>("/admin/roles"),
  updateRolePermission: (roleId: string, permissionKey: string, granted: boolean) =>
    api.put<{ roleId: string; permissionKey: string; granted: boolean }>(
      `/admin/roles/${roleId}/permissions/${encodeURIComponent(permissionKey)}`,
      { granted },
    ),

  listAuditLogs: (query: AuditLogQuery) => api.get<AuditLogResponse>(`/admin/audit-logs${toQueryString({ ...query })}`),

  getSendingLimits: () => api.get<{ limits: SendingLimitRow[] }>("/admin/sending-limits"),
  updateSendingLimit: (type: string, dailyLimit: number) =>
    api.put<{ limits: SendingLimitRow[] }>(`/admin/sending-limits/${type}`, { dailyLimit }),
};
