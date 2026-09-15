import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { uploadCampaignImage } from "../lib/supabaseStorage.js";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES } from "../config/uploads.js";

export const uploadImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(new AppError(400, `Unsupported image type "${file.mimetype}". Use JPEG, PNG, GIF, or WebP.`));
      return;
    }
    cb(null, true);
  },
}).single("image");

export async function uploadImage(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, "No image file was uploaded.");
  }
  // Random name — never trust the uploader-supplied filename, and this also rules out collisions.
  const ext = path.extname(req.file.originalname).toLowerCase();
  const filename = `${crypto.randomUUID()}${ext}`;
  const url = await uploadCampaignImage(req.file.buffer, filename, req.file.mimetype);
  res.status(201).json({ url });
}
