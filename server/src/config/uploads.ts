import path from "node:path";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
export const UPLOADS_URL_PATH = "/uploads";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — plenty for an email/chat campaign image
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_BACKUP_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB — a full data backup can be large
