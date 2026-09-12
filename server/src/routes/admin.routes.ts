import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminRouter = Router();

// Every route here is Administrator-only — this is the most sensitive surface in the app (user
// accounts, the audit trail, and sending-limit overrides), not shared with Marketing Manager the
// way most other write groups are.
adminRouter.use(requireAuth, requirePermission("admin:manage"));

adminRouter.get("/users", asyncHandler(adminController.listUsers));
adminRouter.post("/users", asyncHandler(adminController.createUser));
adminRouter.put("/users/:id", asyncHandler(adminController.updateUser));
adminRouter.delete("/users/:id", asyncHandler(adminController.removeUser));
adminRouter.post("/users/:id/reset-password", asyncHandler(adminController.resetPassword));

adminRouter.get("/roles", asyncHandler(adminController.listRoles));
adminRouter.put("/roles/:roleId/permissions/:permissionKey", asyncHandler(adminController.updateRolePermission));

adminRouter.get("/audit-logs", asyncHandler(adminController.listAuditLogs));

adminRouter.get("/sending-limits", asyncHandler(adminController.getSendingLimits));
adminRouter.put("/sending-limits/:type", asyncHandler(adminController.updateSendingLimit));
