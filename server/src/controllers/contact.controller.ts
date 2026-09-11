import type { Request, Response } from "express";
import { z } from "zod";
import * as contactService from "../services/contact.service.js";
import * as consentService from "../services/consent.service.js";
import { buildViberInviteLink, readViberConfig } from "../services/viber.service.js";
import { prisma } from "../lib/prisma.js";
import {
  bulkUpdateSchema,
  consentInputSchema,
  contactInputSchema,
  contactUpdateSchema,
  importRequestSchema,
  validateImportRow,
} from "../schemas/contact.schema.js";
import { AppError } from "../utils/AppError.js";

const listQuerySchema = z.object({
  search: z.string().optional(),
  customerType: z.string().optional(),
  leadStatus: z.string().optional(),
  tagId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export async function list(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);
  const result = await contactService.listContacts(query);
  res.json(result);
}

export async function exportContacts(req: Request, res: Response) {
  const query = listQuerySchema.omit({ page: true, pageSize: true }).parse(req.query);
  const contacts = await contactService.listAllContactsForExport(query);
  res.json({ contacts });
}

export async function get(req: Request, res: Response) {
  const contact = await contactService.getContact(req.params.id);
  res.json({ contact });
}

export async function create(req: Request, res: Response) {
  const input = contactInputSchema.parse(req.body);
  const contact = await contactService.createContact(input, req.user!.id);
  res.status(201).json({ contact });
}

export async function update(req: Request, res: Response) {
  const input = contactUpdateSchema.parse(req.body);
  const contact = await contactService.updateContact(req.params.id, input, req.user!.id);
  res.json({ contact });
}

export async function remove(req: Request, res: Response) {
  await contactService.deleteContact(req.params.id, req.user!.id);
  res.status(204).send();
}

export async function bulkUpdate(req: Request, res: Response) {
  const input = bulkUpdateSchema.parse(req.body);
  const result = await contactService.bulkUpdateContacts(input, req.user!.id);
  res.json(result);
}

export async function importPreview(req: Request, res: Response) {
  const input = importRequestSchema.parse(req.body);
  const results = await contactService.validateImportRows(input.rows, validateImportRow);
  const summary = {
    total: results.length,
    valid: results.filter((r) => r.status === "valid").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    invalid: results.filter((r) => r.status === "invalid").length,
  };
  res.json({ results, summary });
}

export async function importCommit(req: Request, res: Response) {
  const input = importRequestSchema.parse(req.body);
  const results = await contactService.validateImportRows(input.rows, validateImportRow);
  const validRows = results.filter((r) => r.status === "valid").map((r) => r.data);

  if (validRows.length === 0) {
    throw new AppError(400, "No valid rows to import");
  }

  const result = await contactService.commitImport(validRows, req.user!.id);
  res.status(201).json(result);
}

export async function setConsent(req: Request, res: Response) {
  const input = consentInputSchema.parse(req.body);
  const consent = await consentService.setConsent({
    contactId: req.params.id,
    channel: input.channel,
    optIn: input.optIn,
    consentSource: input.consentSource,
    actorId: req.user!.id,
  });
  res.status(201).json({ consent });
}

export async function consentHistory(req: Request, res: Response) {
  const history = await consentService.getConsentHistory(req.params.id);
  res.json({ history });
}

// Viber requires the contact to message your Public Account before you can ever send to them —
// this generates the one-tap "start chatting with us" link a dealership can share with this
// specific lead (SMS, in person, etc). Refuses honestly if Viber isn't connected rather than
// returning a link that could never actually work.
export async function viberInviteLink(req: Request, res: Response) {
  const integration = await prisma.integration.findFirst({
    where: { type: "VIBER", status: "CONNECTED" },
  });
  if (!integration?.config) {
    throw new AppError(409, "No connected Viber integration — connect one in Integrations first.");
  }
  const config = readViberConfig(integration.config as string);
  if (!config.publicAccountUri) {
    throw new AppError(409, "Connected Viber account has no public URI on record — reconnect it.");
  }
  const link = buildViberInviteLink(config.publicAccountUri, req.params.id);
  res.json({ link });
}
