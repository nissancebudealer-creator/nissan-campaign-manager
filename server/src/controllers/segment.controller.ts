import type { Request, Response } from "express";
import { z } from "zod";
import * as segmentService from "../services/segment.service.js";
import { segmentInputSchema, segmentUpdateSchema, rulesSchema } from "../schemas/segment.schema.js";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export async function list(_req: Request, res: Response) {
  const segments = await segmentService.listSegments();
  res.json({ segments });
}

export async function get(req: Request, res: Response) {
  const segment = await segmentService.getSegment(req.params.id);
  res.json({ segment });
}

export async function create(req: Request, res: Response) {
  const input = segmentInputSchema.parse(req.body);
  const segment = await segmentService.createSegment(input, req.user!.id);
  res.status(201).json({ segment });
}

export async function update(req: Request, res: Response) {
  const input = segmentUpdateSchema.parse(req.body);
  const segment = await segmentService.updateSegment(req.params.id, input, req.user!.id);
  res.json({ segment });
}

export async function remove(req: Request, res: Response) {
  await segmentService.deleteSegment(req.params.id, req.user!.id);
  res.status(204).send();
}

export async function preview(req: Request, res: Response) {
  const { page, pageSize } = paginationSchema.parse(req.query);
  const segment = await segmentService.getSegment(req.params.id);
  const rules = rulesSchema.parse(segment.rulesJson);
  const result = await segmentService.previewMatching(rules, page, pageSize);
  res.json(result);
}

export async function previewRules(req: Request, res: Response) {
  const { page, pageSize } = paginationSchema.parse(req.query);
  const rules = rulesSchema.parse(req.body.rules);
  const result = await segmentService.previewMatching(rules, page, pageSize);
  res.json(result);
}
