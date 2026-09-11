import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pure-logic tests — no network calls, no real WhatsApp/Viber account required. Loads the real
// server/.env so ENCRYPTION_KEY/VIBER_INVITE_SECRET are the real ones.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
for (const key of ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "UNSUBSCRIBE_SECRET", "VIBER_INVITE_SECRET"]) {
  if (parsedEnv?.[key]) process.env[key] = parsedEnv[key];
}

describe("WhatsApp/Viber config encryption", () => {
  it("round-trips a WhatsApp config through encrypt/decrypt", async () => {
    const { encryptWhatsAppConfig, readWhatsAppConfig } = await import("../src/services/whatsapp.service.js");
    const config = { phoneNumberId: "123", accessToken: "EAAtoken", businessName: "Nissan Cebu" };
    const encrypted = encryptWhatsAppConfig(config);
    expect(encrypted).not.toContain("EAAtoken");
    expect(readWhatsAppConfig(encrypted)).toEqual(config);
  });

  it("round-trips a Viber config through encrypt/decrypt", async () => {
    const { encryptViberConfig, readViberConfig } = await import("../src/services/viber.service.js");
    const config = { authToken: "viber-token", senderName: "Nissan Cebu", publicAccountUri: "nissancebu" };
    const encrypted = encryptViberConfig(config);
    expect(encrypted).not.toContain("viber-token");
    expect(readViberConfig(encrypted)).toEqual(config);
  });
});

describe("Viber invite-link context token", () => {
  it("round-trips a contact id", async () => {
    const { buildViberInviteLink, verifyContext } = await import("../src/services/viber.service.js");
    const link = buildViberInviteLink("nissancebu", "contact_123");
    expect(link).toMatch(/^viber:\/\/pa\?chatURI=nissancebu&context=/);
    const context = new URL(link.replace("viber://", "https://")).searchParams.get("context")!;
    expect(verifyContext(context)).toBe("contact_123");
  });

  it("rejects a context forged for a different contact id", async () => {
    const { buildViberInviteLink, verifyContext } = await import("../src/services/viber.service.js");
    const link = buildViberInviteLink("nissancebu", "contact_123");
    const context = new URL(link.replace("viber://", "https://")).searchParams.get("context")!;
    const decoded = Buffer.from(context, "base64url").toString("utf8");
    const [, signature] = decoded.split(":");
    const forged = Buffer.from(`contact_999:${signature}`).toString("base64url");
    expect(verifyContext(forged)).toBeNull();
  });

  it("rejects garbage input without throwing", async () => {
    const { verifyContext } = await import("../src/services/viber.service.js");
    expect(verifyContext("not-a-real-token")).toBeNull();
  });
});

describe("Viber webhook signature verification", () => {
  it("accepts a correctly signed body", async () => {
    const { verifyWebhookSignature } = await import("../src/services/viber.service.js");
    const authToken = "test-auth-token";
    const rawBody = JSON.stringify({ event: "subscribed" });
    const signature = crypto.createHmac("sha256", authToken).update(rawBody).digest("hex");
    expect(verifyWebhookSignature(rawBody, signature, authToken)).toBe(true);
  });

  it("rejects a tampered body even with a signature that was valid for the original", async () => {
    const { verifyWebhookSignature } = await import("../src/services/viber.service.js");
    const authToken = "test-auth-token";
    const rawBody = JSON.stringify({ event: "subscribed" });
    const signature = crypto.createHmac("sha256", authToken).update(rawBody).digest("hex");
    const tamperedBody = JSON.stringify({ event: "unsubscribed" });
    expect(verifyWebhookSignature(tamperedBody, signature, authToken)).toBe(false);
  });

  it("rejects a signature produced with the wrong auth token", async () => {
    const { verifyWebhookSignature } = await import("../src/services/viber.service.js");
    const rawBody = JSON.stringify({ event: "subscribed" });
    const wrongSignature = crypto.createHmac("sha256", "some-other-token").update(rawBody).digest("hex");
    expect(verifyWebhookSignature(rawBody, wrongSignature, "test-auth-token")).toBe(false);
  });

  it("rejects a missing signature header", async () => {
    const { verifyWebhookSignature } = await import("../src/services/viber.service.js");
    expect(verifyWebhookSignature("{}", undefined, "test-auth-token")).toBe(false);
  });
});
