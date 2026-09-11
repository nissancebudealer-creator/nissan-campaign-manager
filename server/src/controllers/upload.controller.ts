import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { getBackendOrigin } from "../lib/backendUrl.js";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES, UPLOADS_DIR, UPLOADS_URL_PATH } from "../config/uploads.js";

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    // Random name — never trust the uploader-supplied filename, and this also rules out collisions.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const uploadImageMiddleware = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(new AppError(400, `Unsupported image type "${file.mimetype}". Use JPEG, PNG, GIF, or WebP.`));
      return;
    }
    cb(null, true);
  },
}).single("image");

export function uploadImage(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, "No image file was uploaded.");
  }
  const url = `${getBackendOrigin()}${UPLOADS_URL_PATH}/${req.file.filename}`;
  res.status(201).json({ url });
}
