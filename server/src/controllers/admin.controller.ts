import type { Request, Response } from "express";
import * as adminService from "../services/admin.service.js";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  auditLogQuerySchema,
  sendingLimitSchema,
} from "../schemas/admin.schema.js";
import { AppError } from "../utils/AppError.js";

export async function listUsers(_req: Request, res: Response) {
  const users = await adminService.listUsers();
  res.json({ users });
}

export async function createUser(req: Request, res: Response) {
  const input = createUserSchema.parse(req.body);
  const user = await adminService.createUser(input, req.user!.id);
  res.status(201).json({ user });
}

export async function updateUser(req: Request, res: Response) {
  const input = updateUserSchema.parse(req.body);
  const user = await adminService.updateUser(req.params.id, input, req.user!.id);
  res.json({ user });
}

export async function resetPassword(req: Request, res: Response) {
  const { password } = resetPasswordSchema.parse(req.body);
  await adminService.resetUserPassword(req.params.id, password, req.user!.id);
  res.status(204).send();
}

export async function listRoles(_req: Request, res: Response) {
  const roles = await adminService.listRoles();
  res.json({ roles });
}

export async function listAuditLogs(req: Request, res: Response) {
  const query = auditLogQuerySchema.parse(req.query);
  const result = await adminService.listAuditLogs(query);
  res.json(result);
}

export async function getSendingLimits(_req: Request, res: Response) {
  const limits = await adminService.getSendingLimits();
  res.json({ limits });
}

const SENDING_LIMIT_TYPES = ["GMAIL", "WHATSAPP", "VIBER"] as const;

export async function updateSendingLimit(req: Request, res: Response) {
  const type = req.params.type.toUpperCase();
  if (!SENDING_LIMIT_TYPES.includes(type as (typeof SENDING_LIMIT_TYPES)[number])) {
    throw new AppError(400, "Unknown channel type");
  }
  const { dailyLimit } = sendingLimitSchema.parse(req.body);
  await adminService.updateSendingLimit(type as (typeof SENDING_LIMIT_TYPES)[number], dailyLimit, req.user!.id);
  const limits = await adminService.getSendingLimits();
  res.json({ limits });
}
