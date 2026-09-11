import { Router } from "express";
import * as tagController from "../controllers/tag.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CAN_MANAGE_TAGS } from "../config/roles.js";

export const tagRouter = Router();

tagRouter.use(requireAuth);

tagRouter.get("/", asyncHandler(tagController.list));
tagRouter.post("/", requireRole(...CAN_MANAGE_TAGS), asyncHandler(tagController.create));
tagRouter.delete("/:id", requireRole(...CAN_MANAGE_TAGS), asyncHandler(tagController.remove));
