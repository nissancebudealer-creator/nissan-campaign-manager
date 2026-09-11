import type { Request, Response } from "express";
import * as automationService from "../services/automation.service.js";
import { automationRuleInputSchema, automationRuleUpdateSchema, enrollContactSchema } from "../schemas/automation.schema.js";

export async function list(_req: Request, res: Response) {
  const rules = await automationService.listAutomationRules();
  res.json({ rules });
}

export async function get(req: Request, res: Response) {
  const rule = await automationService.getAutomationRule(req.params.id);
  res.json({ rule });
}

export async function create(req: Request, res: Response) {
  const input = automationRuleInputSchema.parse(req.body);
  const rule = await automationService.createAutomationRule(input, req.user!.id);
  res.status(201).json({ rule });
}

export async function update(req: Request, res: Response) {
  const input = automationRuleUpdateSchema.parse(req.body);
  const rule = await automationService.updateAutomationRule(req.params.id, input, req.user!.id);
  res.json({ rule });
}

export async function remove(req: Request, res: Response) {
  await automationService.deleteAutomationRule(req.params.id, req.user!.id);
  res.status(204).send();
}

export async function listEnrollments(req: Request, res: Response) {
  const enrollments = await automationService.listEnrollments(req.params.id);
  res.json({ enrollments });
}

export async function enroll(req: Request, res: Response) {
  const { contactId } = enrollContactSchema.parse(req.body);
  const enrollment = await automationService.enrollContact(req.params.id, contactId, req.user!.id);
  res.status(201).json({ enrollment });
}

export async function cancelEnrollment(req: Request, res: Response) {
  const enrollment = await automationService.cancelEnrollment(req.params.enrollmentId, req.user!.id);
  res.json({ enrollment });
}

export async function runNow(_req: Request, res: Response) {
  const result = await automationService.runDueSteps();
  res.json(result);
}
