import { Router } from "express";
import * as tagController from "../controllers/tag.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const tagRouter = Router();

tagRouter.use(requireAuth);

tagRouter.get("/", asyncHandler(tagController.list));
tagRouter.post("/", requirePermission("tags:manage"), asyncHandler(tagController.create));
tagRouter.delete("/:id", requirePermission("tags:manage"), asyncHandler(tagController.remove));
