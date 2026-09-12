import { Router } from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { brandingUpdateSchema } from "../schemas/settings.schema.js";
import * as settingsService from "../services/settings.service.js";

export const settingsRouter = Router();

// Public and unauthenticated on purpose — the login screen renders this before anyone is signed
// in, and it carries nothing sensitive (a display name and a public image URL).
settingsRouter.get(
  "/branding",
  asyncHandler(async (_req, res) => {
    const branding = await settingsService.getBranding();
    res.json(branding);
  }),
);

settingsRouter.put(
  "/branding",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (req, res) => {
    const input = brandingUpdateSchema.parse(req.body);
    const branding = await settingsService.updateBranding(input, req.user!.id);
    res.json(branding);
  }),
);
