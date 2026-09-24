import type { Request, Response } from "express";
import { z } from "zod";
import * as campaignService from "../services/campaign.service.js";
import {
  campaignInputSchema,
  campaignListQuerySchema,
  campaignUpdateSchema,
  scheduleSchema,
  sendRequestSchema,
} from "../schemas/campaign.schema.js";

export async function list(req: Request, res: Response) {
  const filters = campaignListQuerySchema.parse(req.query);
  const campaigns = await campaignService.listCampaigns(filters);
  res.json({ campaigns });
}

export async function get(req: Request, res: Response) {
  const campaign = await campaignService.getCampaign(req.params.id);
  res.json({ campaign });
}

export async function create(req: Request, res: Response) {
  const input = campaignInputSchema.parse(req.body);
  const campaign = await campaignService.createCampaign(input, req.user!.id);
  res.status(201).json({ campaign });
}

export async function update(req: Request, res: Response) {
  const input = campaignUpdateSchema.parse(req.body);
  const campaign = await campaignService.updateCampaign(req.params.id, input, req.user!.id);
  res.json({ campaign });
}

export async function remove(req: Request, res: Response) {
  await campaignService.deleteCampaign(req.params.id, req.user!.id, req.user!.role);
  res.status(204).send();
}

export async function archive(req: Request, res: Response) {
  const campaign = await campaignService.archiveCampaign(req.params.id, req.user!.id, true);
  res.json({ campaign });
}

export async function unarchive(req: Request, res: Response) {
  const campaign = await campaignService.archiveCampaign(req.params.id, req.user!.id, false);
  res.json({ campaign });
}

export async function duplicate(req: Request, res: Response) {
  const campaign = await campaignService.duplicateCampaign(req.params.id, req.user!.id);
  res.status(201).json({ campaign });
}

const audiencePreviewQuerySchema = z.object({
  segmentId: z.string().min(1),
  channel: z.enum(["EMAIL", "WHATSAPP", "VIBER"]),
});

export async function audiencePreview(req: Request, res: Response) {
  const { segmentId, channel } = audiencePreviewQuerySchema.parse(req.query);
  const result = await campaignService.previewAudience(segmentId, channel);
  res.json(result);
}

export async function schedule(req: Request, res: Response) {
  const { scheduledAt } = scheduleSchema.parse(req.body);
  const campaign = await campaignService.scheduleCampaign(req.params.id, new Date(scheduledAt), req.user!.id);
  res.json({ campaign });
}

export async function pause(req: Request, res: Response) {
  const campaign = await campaignService.pauseCampaign(req.params.id, req.user!.id);
  res.json({ campaign });
}

export async function cancel(req: Request, res: Response) {
  const campaign = await campaignService.cancelCampaign(req.params.id, req.user!.id);
  res.json({ campaign });
}

export async function send(req: Request, res: Response) {
  const input = sendRequestSchema.parse(req.body);
  const result = await campaignService.requestSend(req.params.id, req.user!.id, input);
  res.status(200).json(result);
}

export async function recipientLog(req: Request, res: Response) {
  const result = await campaignService.getRecipientLog(req.params.id);
  res.json(result);
}
