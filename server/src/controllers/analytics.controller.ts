import type { Request, Response } from "express";
import * as analyticsService from "../services/analytics.service.js";

export async function dashboard(_req: Request, res: Response) {
  const summary = await analyticsService.getDashboardSummary();
  res.json(summary);
}

export async function campaignReports(_req: Request, res: Response) {
  const reports = await analyticsService.listCampaignsWithMetrics();
  res.json({ reports });
}

export async function campaignReportDetail(req: Request, res: Response) {
  const result = await analyticsService.getCampaignMetrics(req.params.id);
  res.json(result);
}
