import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CAN_WRITE_CAMPAIGNS } from "../config/roles.js";
import * as integrationService from "../services/integration.service.js";
import * as gmailAuth from "../services/gmailAuth.service.js";
import * as whatsapp from "../services/whatsapp.service.js";
import * as viber from "../services/viber.service.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../services/audit.service.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { Prisma } from "@prisma/client";

export const integrationRouter = Router();

// GET / and the Gmail connect/disconnect endpoints require an authenticated app user.
integrationRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const integrations = await integrationService.listIntegrations();
    res.json({ integrations });
  }),
);

// Called via authenticated fetch from the Integrations page — returns a Google consent URL for
// the frontend to navigate the browser to. Kept as a separate step (rather than redirecting
// directly) so the long-lived JWT never has to travel in a URL; only a short-lived signed state
// token does.
integrationRouter.get(
  "/gmail/connect",
  requireAuth,
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(async (req, res) => {
    const state = gmailAuth.signConnectState(req.user!.id);
    const authUrl = gmailAuth.getAuthUrl(state);
    res.json({ authUrl });
  }),
);

integrationRouter.post(
  "/gmail/disconnect",
  requireAuth,
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(async (req, res) => {
    await gmailAuth.disconnectGmail(req.user!.id);
    res.status(204).send();
  }),
);

// The name shown as the sender in a recipient's inbox ("Nissan Cebu Dealer" instead of the raw
// Gmail address) — non-secret, so it's fine to read back without the auth gate the write needs.
integrationRouter.get(
  "/gmail/sender-name",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const integration = await prisma.integration.findFirst({ where: { type: "GMAIL" } });
    if (!integration?.config) {
      res.json({ senderName: null });
      return;
    }
    const config = gmailAuth.readGmailConfig(integration.config as string);
    res.json({ senderName: config.senderName ?? null });
  }),
);

const senderNameSchema = z.object({ senderName: z.string().trim().min(1).max(78) });

integrationRouter.put(
  "/gmail/sender-name",
  requireAuth,
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(async (req, res) => {
    const { senderName } = senderNameSchema.parse(req.body);
    const integration = await prisma.integration.findFirst({ where: { type: "GMAIL" } });
    if (!integration?.config) throw new AppError(404, "Gmail is not connected.");

    const config = gmailAuth.readGmailConfig(integration.config as string);
    await prisma.integration.update({
      where: { id: integration.id },
      data: { config: gmailAuth.encryptGmailConfig({ ...config, senderName }) },
    });
    await recordAudit({
      userId: req.user!.id,
      action: "INTEGRATION_UPDATED",
      entityType: "Integration",
      entityId: integration.id,
      metadata: { type: "GMAIL", field: "senderName", value: senderName },
    });
    res.json({ senderName });
  }),
);

// Google redirects the user's browser here directly — no Authorization header, no cookie. Auth is
// carried entirely by the signed `state` param from /gmail/connect.
integrationRouter.get(
  "/gmail/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(`${env.FRONTEND_URL}/integrations?error=${encodeURIComponent(String(error))}`);
      return;
    }
    if (typeof code !== "string" || typeof state !== "string") {
      res.redirect(`${env.FRONTEND_URL}/integrations?error=missing_code`);
      return;
    }

    try {
      const userId = gmailAuth.verifyConnectState(state);
      const tokens = await gmailAuth.exchangeCodeForTokens(code);
      await gmailAuth.saveGmailIntegration(tokens, userId);
      res.redirect(`${env.FRONTEND_URL}/integrations?connected=gmail`);
    } catch (err) {
      logger.error("Gmail OAuth callback failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      res.redirect(`${env.FRONTEND_URL}/integrations?error=connect_failed`);
    }
  }),
);

// ---------- WhatsApp (Meta Cloud API) ----------
// No OAuth redirect exists for this — a Meta System User access token + Phone Number ID are
// generated in Meta Business Manager and pasted in here. We still never trust them blindly: the
// connection is tested against the real Graph API before ever marking CONNECTED.
const whatsappConfigureSchema = z.object({
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  wabaId: z.string().optional(),
});

integrationRouter.post(
  "/whatsapp/configure",
  requireAuth,
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(async (req, res) => {
    const input = whatsappConfigureSchema.parse(req.body);
    const { verifiedName, displayPhoneNumber } = await whatsapp.testWhatsAppConnection(
      input.phoneNumberId,
      input.accessToken,
    );

    const config: whatsapp.WhatsAppConfig = {
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      wabaId: input.wabaId,
      businessName: verifiedName,
    };

    const existing = await prisma.integration.findFirst({ where: { type: "WHATSAPP" } });
    const integration = existing
      ? await prisma.integration.update({
          where: { id: existing.id },
          data: {
            name: `${verifiedName} (${displayPhoneNumber})`,
            status: "CONNECTED",
            config: whatsapp.encryptWhatsAppConfig(config),
            connectedById: req.user!.id,
          },
        })
      : await prisma.integration.create({
          data: {
            type: "WHATSAPP",
            name: `${verifiedName} (${displayPhoneNumber})`,
            status: "CONNECTED",
            config: whatsapp.encryptWhatsAppConfig(config),
            connectedById: req.user!.id,
          },
        });

    await recordAudit({
      userId: req.user!.id,
      action: "INTEGRATION_CONNECTED",
      entityType: "Integration",
      entityId: integration.id,
      metadata: { type: "WHATSAPP" },
    });
    res.json({ id: integration.id, status: integration.status, name: integration.name });
  }),
);

integrationRouter.post(
  "/whatsapp/disconnect",
  requireAuth,
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(async (req, res) => {
    const integration = await prisma.integration.findFirst({ where: { type: "WHATSAPP" } });
    if (!integration) throw new AppError(404, "WhatsApp is not connected");
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "DISABLED", config: Prisma.DbNull },
    });
    await recordAudit({
      userId: req.user!.id,
      action: "INTEGRATION_DISCONNECTED",
      entityType: "Integration",
      entityId: integration.id,
      metadata: { type: "WHATSAPP" },
    });
    res.status(204).send();
  }),
);

// ---------- Viber (Public Account API) ----------
// Same shape as WhatsApp: no OAuth, a Public Account auth token is pasted in and tested for real.
// testViberConnection also registers our webhook with Viber so subscriber events start flowing —
// see viber.service.ts for why that webhook is load-bearing, not optional.
const viberConfigureSchema = z.object({
  authToken: z.string().min(1),
  senderName: z.string().min(1),
});

integrationRouter.post(
  "/viber/configure",
  requireAuth,
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(async (req, res) => {
    const input = viberConfigureSchema.parse(req.body);
    const { name, uri } = await viber.testViberConnection(input.authToken);

    const config: viber.ViberConfig = {
      authToken: input.authToken,
      senderName: input.senderName,
      publicAccountUri: uri,
    };

    const existing = await prisma.integration.findFirst({ where: { type: "VIBER" } });
    const integration = existing
      ? await prisma.integration.update({
          where: { id: existing.id },
          data: {
            name,
            status: "CONNECTED",
            config: viber.encryptViberConfig(config),
            connectedById: req.user!.id,
          },
        })
      : await prisma.integration.create({
          data: {
            type: "VIBER",
            name,
            status: "CONNECTED",
            config: viber.encryptViberConfig(config),
            connectedById: req.user!.id,
          },
        });

    await recordAudit({
      userId: req.user!.id,
      action: "INTEGRATION_CONNECTED",
      entityType: "Integration",
      entityId: integration.id,
      metadata: { type: "VIBER" },
    });
    res.json({ id: integration.id, status: integration.status, name: integration.name });
  }),
);

integrationRouter.post(
  "/viber/disconnect",
  requireAuth,
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(async (req, res) => {
    const integration = await prisma.integration.findFirst({ where: { type: "VIBER" } });
    if (!integration) throw new AppError(404, "Viber is not connected");
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "DISABLED", config: Prisma.DbNull },
    });
    await recordAudit({
      userId: req.user!.id,
      action: "INTEGRATION_DISCONNECTED",
      entityType: "Integration",
      entityId: integration.id,
      metadata: { type: "VIBER" },
    });
    res.status(204).send();
  }),
);
