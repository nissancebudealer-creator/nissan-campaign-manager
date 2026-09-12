import { Router } from "express";
import * as campaignController from "../controllers/campaign.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CAN_DELETE_CAMPAIGNS, CAN_WRITE_CAMPAIGNS } from "../config/roles.js";

export const campaignRouter = Router();

campaignRouter.use(requireAuth);

campaignRouter.get("/", asyncHandler(campaignController.list));
campaignRouter.get("/audience-preview", asyncHandler(campaignController.audiencePreview));
campaignRouter.get("/:id", asyncHandler(campaignController.get));

campaignRouter.post("/", requireRole(...CAN_WRITE_CAMPAIGNS), asyncHandler(campaignController.create));
campaignRouter.put("/:id", requireRole(...CAN_WRITE_CAMPAIGNS), asyncHandler(campaignController.update));
campaignRouter.delete(
  "/:id",
  requireRole(...CAN_DELETE_CAMPAIGNS),
  asyncHandler(campaignController.remove),
);

campaignRouter.post(
  "/:id/duplicate",
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(campaignController.duplicate),
);
campaignRouter.post(
  "/:id/schedule",
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(campaignController.schedule),
);
campaignRouter.post(
  "/:id/pause",
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(campaignController.pause),
);
campaignRouter.post(
  "/:id/cancel",
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(campaignController.cancel),
);
campaignRouter.post(
  "/:id/send",
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(campaignController.send),
);
campaignRouter.post(
  "/:id/archive",
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(campaignController.archive),
);
campaignRouter.post(
  "/:id/unarchive",
  requireRole(...CAN_WRITE_CAMPAIGNS),
  asyncHandler(campaignController.unarchive),
);
