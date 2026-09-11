import { api } from "./api";
import type { Template, TemplateInput } from "../types";

export interface TemplateListParams {
  category?: string;
  channel?: string;
}

function toQueryString(params: TemplateListParams) {
  const usp = new URLSearchParams();
  if (params.category) usp.set("category", params.category);
  if (params.channel) usp.set("channel", params.channel);
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const templatesApi = {
  list: (params: TemplateListParams = {}) =>
    api.get<{ templates: Template[] }>(`/templates${toQueryString(params)}`),
  get: (id: string) => api.get<{ template: Template }>(`/templates/${id}`),
  create: (input: TemplateInput) => api.post<{ template: Template }>("/templates", input),
  update: (id: string, input: Partial<TemplateInput>) =>
    api.put<{ template: Template }>(`/templates/${id}`, input),
  remove: (id: string) => api.delete<void>(`/templates/${id}`),
};
