import { google } from "googleapis";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../lib/prisma.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { recordAudit } from "./audit.service.js";

// Send scope, the minimal profile scope needed to confirm which Gmail address is connected
// (shown back to the user, and used as the outgoing From address — Gmail's API will reject any
// From that isn't the authenticated account, so this is not optional), and read-only access —
// added specifically so the periodic bounce check (gmailBounce.service.ts) can find and parse
// real bounce-notification emails Gmail delivers back to this inbox. Deliberately gmail.readonly,
// not gmail.modify — bounce detection only ever needs to read; it never labels, trashes, or
// otherwise changes anything in the account (see ProcessedBounceEmail for how it avoids
// re-scanning the same message without needing write access).
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface GmailTokenSet {
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
  email: string;
}

function assertConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new AppError(
      503,
      "Gmail integration is not configured on this server. Set GOOGLE_CLIENT_ID, " +
        "GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in server/.env — see SETUP.md.",
    );
  }
}

function createOAuthClient() {
  assertConfigured();
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

// The OAuth `state` param carries who initiated the connect flow, since Google's redirect back to
// our callback has no other context (no Authorization header, no cookie). Signed + short-lived so
// it can't be forged or replayed.
export function signConnectState(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyConnectState(state: string): string {
  try {
    const payload = jwt.verify(state, env.JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    throw new AppError(400, "This connection link expired or is invalid — please try connecting again.");
  }
}

export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // forces refresh_token on every connect, not just the first ever
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<GmailTokenSet> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new AppError(
      502,
      "Google did not return a refresh token. Revoke this app's access at " +
        "https://myaccount.google.com/permissions and try connecting again.",
    );
  }
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) {
    throw new AppError(502, "Could not read the connected Gmail account's email address.");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ?? null,
    email: data.email,
  };
}

export async function saveGmailIntegration(tokens: GmailTokenSet, connectedById: string) {
  const existing = await prisma.integration.findFirst({ where: { type: "GMAIL" } });

  // getAuthUrl forces prompt:"consent" on every connect, not just the first ever, so a reconnect
  // (e.g. to fix a scope issue) must not silently wipe settings the admin already configured —
  // carry the sender name and daily limit override forward across the token refresh.
  let previousSenderName: string | undefined;
  let previousDailyLimit: number | undefined;
  if (existing?.config) {
    try {
      const previous = readGmailConfig(existing.config as string);
      previousSenderName = previous.senderName;
      previousDailyLimit = previous.dailyLimit;
    } catch {
      // Corrupt/undecryptable old config (or a fresh key) — nothing to carry forward.
    }
  }

  const configPlaintext = JSON.stringify({
    email: tokens.email,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    expiryDate: tokens.expiryDate,
    sentToday: 0,
    sentTodayDate: new Date().toISOString().slice(0, 10),
    senderName: previousSenderName,
    dailyLimit: previousDailyLimit,
  });
  const integration = existing
    ? await prisma.integration.update({
        where: { id: existing.id },
        data: {
          name: tokens.email,
          status: "CONNECTED",
          config: encryptSecret(configPlaintext),
          connectedById,
        },
      })
    : await prisma.integration.create({
        data: {
          type: "GMAIL",
          name: tokens.email,
          status: "CONNECTED",
          config: encryptSecret(configPlaintext),
          connectedById,
        },
      });

  await recordAudit({
    userId: connectedById,
    action: "INTEGRATION_CONNECTED",
    entityType: "Integration",
    entityId: integration.id,
    metadata: { type: "GMAIL", email: tokens.email },
  });

  return integration;
}

export async function disconnectGmail(actorId: string) {
  const integration = await prisma.integration.findFirst({ where: { type: "GMAIL" } });
  if (!integration) throw new AppError(404, "Gmail is not connected");

  await prisma.integration.update({
    where: { id: integration.id },
    data: { status: "DISABLED", config: Prisma.DbNull },
  });
  await recordAudit({
    userId: actorId,
    action: "INTEGRATION_DISCONNECTED",
    entityType: "Integration",
    entityId: integration.id,
    metadata: { type: "GMAIL" },
  });
}

export interface StoredGmailConfig {
  email: string;
  refreshToken: string;
  accessToken: string;
  expiryDate: number | null;
  sentToday: number;
  sentTodayDate: string;
  dailyLimit?: number; // admin-adjustable override — see gmailLimits.ts DEFAULT_DAILY_LIMIT
  // Shown to recipients as the sender in their inbox ("Nissan Cebu Dealer <address@gmail.com>")
  // instead of the raw address — falls back to the address itself when unset.
  senderName?: string;
}

export function readGmailConfig(encryptedConfig: string): StoredGmailConfig {
  return JSON.parse(decryptSecret(encryptedConfig)) as StoredGmailConfig;
}

export function encryptGmailConfig(config: StoredGmailConfig): string {
  return encryptSecret(JSON.stringify(config));
}

// Returns an OAuth2 client pre-loaded with the stored refresh token, so googleapis transparently
// refreshes the access token as needed for the actual gmail.users.messages.send call.
export function clientFromStoredConfig(config: StoredGmailConfig) {
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: config.refreshToken });
  return client;
}
