import { Router } from "express";
import multer from "multer";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { MAX_BACKUP_UPLOAD_BYTES } from "../config/uploads.js";
import * as backupService from "../services/backup.service.js";

export const backupRouter = Router();

backupRouter.use(requireAuth, requirePermission("admin:manage"));

backupRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const file = await backupService.exportBackup(req.user!.id);
    const filename = `campaign-manager-backup-${file.exportedAt.slice(0, 10)}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(file);
  }),
);

// A full backup can genuinely be tens of MB for an active dealership — well past the app-wide
// 2mb express.json() limit, so this route parses the upload itself via multer instead.
const uploadBackupFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BACKUP_UPLOAD_BYTES },
}).single("backup");

backupRouter.post(
  "/import",
  uploadBackupFile,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, "No backup file was uploaded.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.file.buffer.toString("utf8"));
    } catch {
      throw new AppError(400, "That file isn't valid JSON — is it really a backup exported from this app?");
    }
    const summaries = await backupService.importBackup(parsed, req.user!.id);
    res.json({ summaries });
  }),
);
