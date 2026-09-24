import { Router } from "express";
import * as campaignController from "../controllers/campaign.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const campaignRouter = Router();

campaignRouter.use(requireAuth);

campaignRouter.get("/", asyncHandler(campaignController.list));
campaignRouter.get("/audience-preview", asyncHandler(campaignController.audiencePreview));
campaignRouter.get("/:id", asyncHandler(campaignController.get));
campaignRouter.get("/:id/recipients", asyncHandler(campaignController.recipientLog));

campaignRouter.post("/", requirePermission("campaigns:write"), asyncHandler(campaignController.create));
campaignRouter.put("/:id", requirePermission("campaigns:write"), asyncHandler(campaignController.update));
campaignRouter.delete(
  "/:id",
  requirePermission("campaigns:delete"),
  asyncHandler(campaignController.remove),
);

campaignRouter.post(
  "/:id/duplicate",
  requirePermission("campaigns:write"),
  asyncHandler(campaignController.duplicate),
);
campaignRouter.post(
  "/:id/schedule",
  requirePermission("campaigns:write"),
  asyncHandler(campaignController.schedule),
);
campaignRouter.post(
  "/:id/pause",
  requirePermission("campaigns:write"),
  asyncHandler(campaignController.pause),
);
campaignRouter.post(
  "/:id/cancel",
  requirePermission("campaigns:write"),
  asyncHandler(campaignController.cancel),
);
campaignRouter.post(
  "/:id/send",
  requirePermission("campaigns:write"),
  asyncHandler(campaignController.send),
);
campaignRouter.post(
  "/:id/archive",
  requirePermission("campaigns:write"),
  asyncHandler(campaignController.archive),
);
campaignRouter.post(
  "/:id/unarchive",
  requirePermission("campaigns:write"),
  asyncHandler(campaignController.unarchive),
);
