import { Router } from "express";
import * as templateController from "../controllers/template.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CAN_DELETE_TEMPLATES, CAN_WRITE_TEMPLATES } from "../config/roles.js";

export const templateRouter = Router();

templateRouter.use(requireAuth);

templateRouter.get("/", asyncHandler(templateController.list));
templateRouter.get("/:id", asyncHandler(templateController.get));

templateRouter.post("/", requireRole(...CAN_WRITE_TEMPLATES), asyncHandler(templateController.create));
templateRouter.put("/:id", requireRole(...CAN_WRITE_TEMPLATES), asyncHandler(templateController.update));
templateRouter.delete(
  "/:id",
  requireRole(...CAN_DELETE_TEMPLATES),
  asyncHandler(templateController.remove),
);
