import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { AppError } from "../utils/AppError.js";
import { MAX_UPLOAD_BYTES, MAX_BACKUP_UPLOAD_BYTES } from "../config/uploads.js";
import { logger } from "../utils/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof MulterError) {
    // Different upload routes carry different size limits (a campaign image vs. a full data
    // backup) — the field name tells us which one actually rejected this request.
    const limitBytes = err.field === "backup" ? MAX_BACKUP_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `File is too large — the limit is ${Math.round(limitBytes / (1024 * 1024))}MB.`
        : `Upload failed: ${err.message}`;
    res.status(400).json({ error: message });
    return;
  }

  logger.error("Unhandled error", { message: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: "Internal server error" });
}
