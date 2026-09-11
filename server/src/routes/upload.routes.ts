import { Router } from "express";
import * as uploadController from "../controllers/upload.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CAN_WRITE_TEMPLATES } from "../config/roles.js";

export const uploadRouter = Router();

uploadRouter.use(requireAuth);

// Same role gate as templates/campaigns (identical set) — an image upload is only ever used to
// populate one of those two.
uploadRouter.post(
  "/image",
  requireRole(...CAN_WRITE_TEMPLATES),
  uploadController.uploadImageMiddleware,
  asyncHandler(async (req, res) => uploadController.uploadImage(req, res)),
);
