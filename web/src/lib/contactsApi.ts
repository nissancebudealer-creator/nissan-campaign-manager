import { api } from "./api";
import type {
  Contact,
  ContactInput,
  ContactListResponse,
  ImportPreviewResponse,
  Tag,
} from "../types";

export interface ContactListParams {
  search?: string;
  customerType?: string;
  leadStatus?: string;
  tagId?: string;
  page?: number;
  pageSize?: number;
}

function toQueryString(params: object) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const contactsApi = {
  list: (params: ContactListParams) =>
    api.get<ContactListResponse>(`/contacts${toQueryString(params)}`),

  get: (id: string) => api.get<{ contact: Contact }>(`/contacts/${id}`),

  create: (input: ContactInput) => api.post<{ contact: Contact }>("/contacts", input),

  update: (id: string, input: Partial<ContactInput>) =>
    api.put<{ contact: Contact }>(`/contacts/${id}`, input),

  remove: (id: string) => api.delete<void>(`/contacts/${id}`),

  bulkUpdate: (input: {
    contactIds: string[];
    addTagIds?: string[];
    removeTagIds?: string[];
    leadStatus?: string;
  }) => api.post<{ updated: number }>("/contacts/bulk", input),

  export: (params: ContactListParams) =>
    api.get<{ contacts: Contact[] }>(`/contacts/export${toQueryString(params)}`),

  importPreview: (rows: Record<string, string>[]) =>
    api.post<ImportPreviewResponse>("/contacts/import/preview", { dryRun: true, rows }),

  importCommit: (rows: Record<string, string>[]) =>
    api.post<{ created: number }>("/contacts/import/commit", { dryRun: false, rows }),

  setConsent: (id: string, input: { channel: string; optIn: boolean; consentSource?: string }) =>
    api.post(`/contacts/${id}/consent`, input),

  viberInviteLink: (id: string) => api.get<{ link: string }>(`/contacts/${id}/viber-invite-link`),
};

export const tagsApi = {
  list: () => api.get<{ tags: Tag[] }>("/tags"),
  create: (name: string, color?: string) => api.post<{ tag: Tag }>("/tags", { name, color }),
  remove: (id: string) => api.delete<void>(`/tags/${id}`),
};
