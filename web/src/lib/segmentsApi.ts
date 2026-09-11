import { api } from "./api";
import type { Segment, SegmentPreviewResponse, SegmentRules } from "../types";

export interface SegmentInput {
  name: string;
  description?: string | null;
  rules: SegmentRules;
}

export const segmentsApi = {
  list: () => api.get<{ segments: Segment[] }>("/segments"),
  get: (id: string) => api.get<{ segment: Segment }>(`/segments/${id}`),
  create: (input: SegmentInput) => api.post<{ segment: Segment }>("/segments", input),
  update: (id: string, input: Partial<SegmentInput>) =>
    api.put<{ segment: Segment }>(`/segments/${id}`, input),
  remove: (id: string) => api.delete<void>(`/segments/${id}`),
  preview: (id: string, page = 1, pageSize = 25) =>
    api.get<SegmentPreviewResponse>(`/segments/${id}/preview?page=${page}&pageSize=${pageSize}`),
  previewRules: (rules: SegmentRules, page = 1, pageSize = 10) =>
    api.post<SegmentPreviewResponse>(`/segments/preview?page=${page}&pageSize=${pageSize}`, { rules }),
};
