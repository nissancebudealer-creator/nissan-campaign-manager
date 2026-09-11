import type { Request, Response } from "express";
import * as templateService from "../services/template.service.js";
import { templateInputSchema, templateListQuerySchema, templateUpdateSchema } from "../schemas/template.schema.js";

export async function list(req: Request, res: Response) {
  const filters = templateListQuerySchema.parse(req.query);
  const templates = await templateService.listTemplates(filters);
  res.json({ templates });
}

export async function get(req: Request, res: Response) {
  const template = await templateService.getTemplate(req.params.id);
  res.json({ template });
}

export async function create(req: Request, res: Response) {
  const input = templateInputSchema.parse(req.body);
  const template = await templateService.createTemplate(input, req.user!.id);
  res.status(201).json({ template });
}

export async function update(req: Request, res: Response) {
  const input = templateUpdateSchema.parse(req.body);
  const template = await templateService.updateTemplate(req.params.id, input, req.user!.id);
  res.json({ template });
}

export async function remove(req: Request, res: Response) {
  await templateService.deleteTemplate(req.params.id, req.user!.id);
  res.status(204).send();
}
