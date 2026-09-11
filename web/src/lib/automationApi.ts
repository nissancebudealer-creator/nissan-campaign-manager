import { api } from "./api";
import type { AutomationEnrollment, AutomationRule, AutomationRuleInput } from "../types";

export const automationApi = {
  list: () => api.get<{ rules: AutomationRule[] }>("/automation-rules"),
  get: (id: string) => api.get<{ rule: AutomationRule }>(`/automation-rules/${id}`),
  create: (input: AutomationRuleInput) => api.post<{ rule: AutomationRule }>("/automation-rules", input),
  update: (id: string, input: Partial<AutomationRuleInput>) =>
    api.put<{ rule: AutomationRule }>(`/automation-rules/${id}`, input),
  remove: (id: string) => api.delete<void>(`/automation-rules/${id}`),
  listEnrollments: (id: string) => api.get<{ enrollments: AutomationEnrollment[] }>(`/automation-rules/${id}/enrollments`),
  enroll: (id: string, contactId: string) =>
    api.post<{ enrollment: AutomationEnrollment }>(`/automation-rules/${id}/enroll`, { contactId }),
  cancelEnrollment: (enrollmentId: string) =>
    api.post<{ enrollment: AutomationEnrollment }>(`/automation-rules/enrollments/${enrollmentId}/cancel`),
  runNow: () => api.post<{ processed: number; sent: number; failed: number; skipped: number }>("/automation-rules/run-now"),
};
