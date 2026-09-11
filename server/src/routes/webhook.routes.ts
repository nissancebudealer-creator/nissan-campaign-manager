import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { readViberConfig, verifyWebhookSignature, handleWebhookEvent } from "../services/viber.service.js";
import { logger } from "../utils/logger.js";

// The raw body is stashed by app.ts's express.json({ verify }) hook, which has no first-class
// Express type of its own.
type RequestWithRawBody = Request & { rawBody?: Buffer };

export const webhookRouter = Router();

// Public route — Viber calls this directly, no Authorization header. Every request is verified
// against the connected integration's own auth token before anything in the body is trusted (see
// verifyWebhookSignature). This is how a contact's real Viber user id gets attributed after they
// tap an invite link and message the Public Account — see viber.service.ts.
webhookRouter.post(
  "/viber",
  asyncHandler(async (req, res) => {
    const integration = await prisma.integration.findFirst({
      where: { type: "VIBER", status: "CONNECTED" },
    });
    if (!integration?.config) {
      res.status(200).json({ status: 0 }); // Viber expects a 200 even when we can't act on it
      return;
    }

    const config = readViberConfig(integration.config as string);
    const rawBody = (req as RequestWithRawBody).rawBody?.toString("utf8") ?? "";
    const signature = req.header("X-Viber-Content-Signature");

    if (!verifyWebhookSignature(rawBody, signature, config.authToken)) {
      logger.warn("Rejected Viber webhook with invalid signature");
      res.status(200).json({ status: 0 });
      return;
    }

    await handleWebhookEvent(req.body);
    res.status(200).json({ status: 0 });
  }),
);
