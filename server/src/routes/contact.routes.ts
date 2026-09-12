import { Router } from "express";
import * as contactController from "../controllers/contact.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const contactRouter = Router();

contactRouter.use(requireAuth);

contactRouter.get("/", asyncHandler(contactController.list));
contactRouter.get("/export", asyncHandler(contactController.exportContacts));
contactRouter.get("/:id", asyncHandler(contactController.get));
contactRouter.get("/:id/consents", asyncHandler(contactController.consentHistory));
contactRouter.get("/:id/viber-invite-link", asyncHandler(contactController.viberInviteLink));

contactRouter.post("/", requirePermission("contacts:write"), asyncHandler(contactController.create));
contactRouter.put("/:id", requirePermission("contacts:write"), asyncHandler(contactController.update));
contactRouter.delete("/:id", requirePermission("contacts:delete"), asyncHandler(contactController.remove));

contactRouter.post("/bulk", requirePermission("contacts:write"), asyncHandler(contactController.bulkUpdate));

contactRouter.post(
  "/import/preview",
  requirePermission("contacts:write"),
  asyncHandler(contactController.importPreview),
);
contactRouter.post(
  "/import/commit",
  requirePermission("contacts:write"),
  asyncHandler(contactController.importCommit),
);

contactRouter.post(
  "/:id/consent",
  requirePermission("contacts:write"),
  asyncHandler(contactController.setConsent),
);
