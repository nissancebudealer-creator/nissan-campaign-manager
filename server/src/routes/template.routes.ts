import { Router } from "express";
import * as templateController from "../controllers/template.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const templateRouter = Router();

templateRouter.use(requireAuth);

templateRouter.get("/", asyncHandler(templateController.list));
templateRouter.get("/:id", asyncHandler(templateController.get));

templateRouter.post("/", requirePermission("templates:write"), asyncHandler(templateController.create));
templateRouter.put("/:id", requirePermission("templates:write"), asyncHandler(templateController.update));
templateRouter.delete(
  "/:id",
  requirePermission("templates:delete"),
  asyncHandler(templateController.remove),
);
