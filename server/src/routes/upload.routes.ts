import { Router } from "express";
import * as uploadController from "../controllers/upload.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const uploadRouter = Router();

uploadRouter.use(requireAuth);

// Same permission as templates/campaigns writes — an image upload is only ever used to populate
// one of those two.
uploadRouter.post(
  "/image",
  requirePermission("templates:write"),
  uploadController.uploadImageMiddleware,
  asyncHandler(async (req, res) => uploadController.uploadImage(req, res)),
);
