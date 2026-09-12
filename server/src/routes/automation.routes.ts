import { Router } from "express";
import * as automationController from "../controllers/automation.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const automationRouter = Router();

automationRouter.use(requireAuth);

automationRouter.get("/", asyncHandler(automationController.list));
automationRouter.get("/:id", asyncHandler(automationController.get));
automationRouter.get("/:id/enrollments", asyncHandler(automationController.listEnrollments));

automationRouter.post("/", requirePermission("campaigns:write"), asyncHandler(automationController.create));
automationRouter.put("/:id", requirePermission("campaigns:write"), asyncHandler(automationController.update));
automationRouter.delete("/:id", requirePermission("campaigns:delete"), asyncHandler(automationController.remove));

automationRouter.post(
  "/:id/enroll",
  requirePermission("campaigns:write"),
  asyncHandler(automationController.enroll),
);
automationRouter.post(
  "/enrollments/:enrollmentId/cancel",
  requirePermission("campaigns:write"),
  asyncHandler(automationController.cancelEnrollment),
);

// Triggerable by a staff "Run now" button, and by an external free-tier cron pinger in production
// when the server has scaled to zero — see ARCHITECTURE.md. Still requires auth like every other
// write here; a cron pinger authenticates with a real account's token the same as a person would.
automationRouter.post(
  "/run-now",
  requirePermission("campaigns:write"),
  asyncHandler(automationController.runNow),
);
