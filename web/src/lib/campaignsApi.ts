import { api } from "./api";
import type { AudiencePreview, Campaign, CampaignInput, CampaignStatus, Integration } from "../types";

export interface CampaignListParams {
  status?: CampaignStatus;
  channel?: string;
  includeArchived?: boolean;
}

function toQueryString(params: object) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const campaignsApi = {
  list: (params: CampaignListParams = {}) =>
    api.get<{ campaigns: Campaign[] }>(`/campaigns${toQueryString(params)}`),
  get: (id: string) => api.get<{ campaign: Campaign }>(`/campaigns/${id}`),
  create: (input: CampaignInput) => api.post<{ campaign: Campaign }>("/campaigns", input),
  update: (id: string, input: Partial<CampaignInput>) =>
    api.put<{ campaign: Campaign }>(`/campaigns/${id}`, input),
  remove: (id: string) => api.delete<void>(`/campaigns/${id}`),
  duplicate: (id: string) => api.post<{ campaign: Campaign }>(`/campaigns/${id}/duplicate`),
  audiencePreview: (segmentId: string, channel: string) =>
    api.get<AudiencePreview>(`/campaigns/audience-preview${toQueryString({ segmentId, channel })}`),
  schedule: (id: string, scheduledAt: string) =>
    api.post<{ campaign: Campaign }>(`/campaigns/${id}/schedule`, { scheduledAt }),
  pause: (id: string) => api.post<{ campaign: Campaign }>(`/campaigns/${id}/pause`),
  cancel: (id: string) => api.post<{ campaign: Campaign }>(`/campaigns/${id}/cancel`),
  send: (id: string, testMode: boolean, batchSize?: number) =>
    api.post<
      | { testSentTo: string }
      | { sentCount: number; failedCount: number; remainingCount: number; throttledReason?: string; throttledUntil?: string }
    >(`/campaigns/${id}/send`, { testMode, batchSize }),
  archive: (id: string) => api.post<{ campaign: Campaign }>(`/campaigns/${id}/archive`),
  unarchive: (id: string) => api.post<{ campaign: Campaign }>(`/campaigns/${id}/unarchive`),
};

export const integrationsApi = {
  list: () => api.get<{ integrations: Integration[] }>("/integrations"),
  connectGmail: () => api.get<{ authUrl: string }>("/integrations/gmail/connect"),
  disconnectGmail: () => api.post<void>("/integrations/gmail/disconnect"),
  getGmailSenderName: () => api.get<{ senderName: string | null }>("/integrations/gmail/sender-name"),
  updateGmailSenderName: (senderName: string) =>
    api.put<{ senderName: string }>("/integrations/gmail/sender-name", { senderName }),
  configureWhatsApp: (input: { phoneNumberId: string; accessToken: string; wabaId?: string }) =>
    api.post<{ id: string; status: string; name: string }>("/integrations/whatsapp/configure", input),
  disconnectWhatsApp: () => api.post<void>("/integrations/whatsapp/disconnect"),
  configureViber: (input: { authToken: string; senderName: string }) =>
    api.post<{ id: string; status: string; name: string }>("/integrations/viber/configure", input),
  disconnectViber: () => api.post<void>("/integrations/viber/disconnect"),
};
