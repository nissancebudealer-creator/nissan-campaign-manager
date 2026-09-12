import { Router } from "express";
import * as segmentController from "../controllers/segment.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const segmentRouter = Router();

segmentRouter.use(requireAuth);

segmentRouter.get("/", asyncHandler(segmentController.list));
segmentRouter.post("/preview", asyncHandler(segmentController.previewRules));
segmentRouter.get("/:id", asyncHandler(segmentController.get));
segmentRouter.get("/:id/preview", asyncHandler(segmentController.preview));

segmentRouter.post("/", requirePermission("segments:write"), asyncHandler(segmentController.create));
segmentRouter.put("/:id", requirePermission("segments:write"), asyncHandler(segmentController.update));
segmentRouter.delete(
  "/:id",
  requirePermission("segments:delete"),
  asyncHandler(segmentController.remove),
);
