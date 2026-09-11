import { Router } from "express";
import * as segmentController from "../controllers/segment.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CAN_DELETE_SEGMENTS, CAN_WRITE_SEGMENTS } from "../config/roles.js";

export const segmentRouter = Router();

segmentRouter.use(requireAuth);

segmentRouter.get("/", asyncHandler(segmentController.list));
segmentRouter.post("/preview", asyncHandler(segmentController.previewRules));
segmentRouter.get("/:id", asyncHandler(segmentController.get));
segmentRouter.get("/:id/preview", asyncHandler(segmentController.preview));

segmentRouter.post("/", requireRole(...CAN_WRITE_SEGMENTS), asyncHandler(segmentController.create));
segmentRouter.put("/:id", requireRole(...CAN_WRITE_SEGMENTS), asyncHandler(segmentController.update));
segmentRouter.delete(
  "/:id",
  requireRole(...CAN_DELETE_SEGMENTS),
  asyncHandler(segmentController.remove),
);
