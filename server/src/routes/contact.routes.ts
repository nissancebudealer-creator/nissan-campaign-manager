import { Router } from "express";
import * as contactController from "../controllers/contact.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CAN_DELETE_CONTACTS, CAN_WRITE_CONTACTS } from "../config/roles.js";

export const contactRouter = Router();

contactRouter.use(requireAuth);

contactRouter.get("/", asyncHandler(contactController.list));
contactRouter.get("/export", asyncHandler(contactController.exportContacts));
contactRouter.get("/:id", asyncHandler(contactController.get));
contactRouter.get("/:id/consents", asyncHandler(contactController.consentHistory));
contactRouter.get("/:id/viber-invite-link", asyncHandler(contactController.viberInviteLink));

contactRouter.post("/", requireRole(...CAN_WRITE_CONTACTS), asyncHandler(contactController.create));
contactRouter.put("/:id", requireRole(...CAN_WRITE_CONTACTS), asyncHandler(contactController.update));
contactRouter.delete("/:id", requireRole(...CAN_DELETE_CONTACTS), asyncHandler(contactController.remove));

contactRouter.post("/bulk", requireRole(...CAN_WRITE_CONTACTS), asyncHandler(contactController.bulkUpdate));

contactRouter.post(
  "/import/preview",
  requireRole(...CAN_WRITE_CONTACTS),
  asyncHandler(contactController.importPreview),
);
contactRouter.post(
  "/import/commit",
  requireRole(...CAN_WRITE_CONTACTS),
  asyncHandler(contactController.importCommit),
);

contactRouter.post(
  "/:id/consent",
  requireRole(...CAN_WRITE_CONTACTS),
  asyncHandler(contactController.setConsent),
);
