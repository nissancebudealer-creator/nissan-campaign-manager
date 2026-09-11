import type { Request, Response } from "express";
import { z } from "zod";
import * as tagService from "../services/tag.service.js";

const createTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export async function list(_req: Request, res: Response) {
  const tags = await tagService.listTags();
  res.json({ tags });
}

export async function create(req: Request, res: Response) {
  const input = createTagSchema.parse(req.body);
  const tag = await tagService.createTag(input.name, input.color);
  res.status(201).json({ tag });
}

export async function remove(req: Request, res: Response) {
  await tagService.deleteTag(req.params.id);
  res.status(204).send();
}
