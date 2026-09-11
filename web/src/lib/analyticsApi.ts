import { api } from "./api";
import type { CampaignMetrics, CampaignReportEntry, Campaign, DashboardSummary } from "../types";

export const analyticsApi = {
  dashboard: () => api.get<DashboardSummary>("/dashboard"),
  campaignReports: () => api.get<{ reports: CampaignReportEntry[] }>("/reports/campaigns"),
  campaignReportDetail: (id: string) =>
    api.get<{ campaign: Campaign; metrics: CampaignMetrics }>(`/reports/campaigns/${id}`),
};
