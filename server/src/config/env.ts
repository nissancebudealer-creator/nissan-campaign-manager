import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5174"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),

  FRONTEND_URL: z.string().default("http://localhost:5174"),
  // Where THIS backend is actually reachable from the internet — embedded in every campaign
  // email as the image URL, the open-tracking pixel, and the click-redirect link. Optional only
  // because local dev falls back to GOOGLE_REDIRECT_URI's origin (see backendUrl.ts) — set this
  // explicitly once deployed (see DEPLOYMENT.md), since a recipient's own "localhost" is their
  // own machine, not yours, and none of those three things work for them until this is real.
  PUBLIC_APP_URL: z.string().optional().default(""),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),
  UNSUBSCRIBE_SECRET: z.string().min(16, "UNSUBSCRIBE_SECRET must be at least 16 characters"),
  VIBER_INVITE_SECRET: z.string().min(16, "VIBER_INVITE_SECRET must be at least 16 characters"),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check server/.env against .env.example.");
}

export const env = parsed.data;
