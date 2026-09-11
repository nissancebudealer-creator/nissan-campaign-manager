import { describe, expect, it, beforeAll } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These are pure-logic tests that don't touch the network or a real Google account — they load
// the real server/.env so ENCRYPTION_KEY/UNSUBSCRIBE_SECRET/JWT_SECRET are the real ones, but
// GOOGLE_CLIENT_ID/SECRET are expected to be blank until Phase 6's OAuth setup is completed with
// the user, which this file also verifies fails clearly rather than silently.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
for (const key of ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "UNSUBSCRIBE_SECRET"]) {
  if (parsedEnv?.[key]) process.env[key] = parsedEnv[key];
}

beforeAll(() => {
  // GOOGLE_CLIENT_ID/SECRET intentionally left as whatever server/.env currently has (blank
  // until the user completes Google Cloud Console setup) — do not override them here.
});

describe("crypto (encryptSecret/decryptSecret)", () => {
  it("round-trips a plaintext string", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/lib/crypto.js");
    const plaintext = JSON.stringify({ refreshToken: "1//abc", email: "jo@example.com" });
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain("refreshToken");
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptSecret } = await import("../src/lib/crypto.js");
    const a = encryptSecret("same input");
    const b = encryptSecret("same input");
    expect(a).not.toBe(b);
  });

  it("fails to decrypt a tampered payload", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/lib/crypto.js");
    const encrypted = encryptSecret("secret value");
    const tampered = encrypted.slice(0, -2) + "00";
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips contact id + channel", async () => {
    const { generateUnsubscribeToken, verifyUnsubscribeToken } = await import(
      "../src/services/unsubscribe.service.js"
    );
    const token = generateUnsubscribeToken("contact_123", "EMAIL");
    const result = verifyUnsubscribeToken(token);
    expect(result).toEqual({ contactId: "contact_123", channel: "EMAIL" });
  });

  it("rejects a token issued for a different contact when substituted in", async () => {
    const { generateUnsubscribeToken, verifyUnsubscribeToken } = await import(
      "../src/services/unsubscribe.service.js"
    );
    // Simulate tampering: take a valid token's signature but pair it with a different contact id
    // by decoding, editing, and re-encoding without re-signing — this must fail verification.
    const token = generateUnsubscribeToken("contact_123", "EMAIL");
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [, channel, signature] = decoded.split(":");
    const forged = Buffer.from(`contact_999:${channel}:${signature}`).toString("base64url");
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects garbage input without throwing", async () => {
    const { verifyUnsubscribeToken } = await import("../src/services/unsubscribe.service.js");
    expect(verifyUnsubscribeToken("not-a-real-token")).toBeNull();
  });
});

describe("MIME message builder", () => {
  it("produces a base64url string that decodes to valid RFC 2822 headers + HTML body", async () => {
    const { buildMimeMessage } = await import("../src/lib/mime.js");
    const raw = buildMimeMessage({
      from: "Jo Gahiton <jo@example.com>",
      to: "customer@example.com",
      subject: "Hi there",
      html: "<p>Hello!</p>",
    });
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    expect(raw).not.toContain("=");

    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("From: Jo Gahiton <jo@example.com>");
    expect(decoded).toContain("To: customer@example.com");
    expect(decoded).toContain("Subject: Hi there");
    expect(decoded).toContain("<p>Hello!</p>");
  });

  it("RFC 2047 encodes a non-ASCII subject", async () => {
    const { buildMimeMessage } = await import("../src/lib/mime.js");
    const raw = buildMimeMessage({
      from: "a@example.com",
      to: "b@example.com",
      subject: "Café offer ☕",
      html: "<p>x</p>",
    });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});

describe("personalization substitution", () => {
  it("substitutes known variables and leaves unsupported tokens untouched", async () => {
    const { renderPersonalization } = await import("../src/config/personalization.js");
    const result = renderPersonalization(
      "Hi {{first_name}} {{last_name}} from {{company}}, re: {{product_interest}} — {{not_real}}",
      { first_name: "Jo", last_name: "Gahiton", company: "Acme Motors", product_interest: "SUV" },
    );
    expect(result).toBe("Hi Jo Gahiton from Acme Motors, re: SUV — {{not_real}}");
  });

  it("renders a missing field as an empty string, not the literal token", async () => {
    const { renderPersonalization } = await import("../src/config/personalization.js");
    const result = renderPersonalization("Hi {{first_name}}!", {});
    expect(result).toBe("Hi !");
  });
});

describe("email HTML rendering", () => {
  it("escapes HTML in the message body and includes the unsubscribe link", async () => {
    const { renderEmailHtml } = await import("../src/lib/renderEmailHtml.js");
    const html = renderEmailHtml({
      message: "Hi <script>alert(1)</script> & welcome",
      unsubscribeUrl: "https://example.com/unsub?token=abc",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("https://example.com/unsub?token=abc");
  });

  it("includes the CTA button only when both label and URL are present", async () => {
    const { renderEmailHtml } = await import("../src/lib/renderEmailHtml.js");
    const withCta = renderEmailHtml({
      message: "Hi",
      ctaLabel: "Book now",
      ctaUrl: "https://example.com/book",
      unsubscribeUrl: "https://example.com/unsub",
    });
    expect(withCta).toContain("Book now");

    const withoutCta = renderEmailHtml({ message: "Hi", unsubscribeUrl: "https://example.com/unsub" });
    expect(withoutCta).not.toContain("Book now");
  });
});

describe("Gmail OAuth state token", () => {
  it("round-trips a user id", async () => {
    const { signConnectState, verifyConnectState } = await import("../src/services/gmailAuth.service.js");
    const state = signConnectState("user_123");
    expect(verifyConnectState(state)).toBe("user_123");
  });

  it("rejects a garbage state token", async () => {
    const { verifyConnectState } = await import("../src/services/gmailAuth.service.js");
    expect(() => verifyConnectState("not-a-real-jwt")).toThrow(/expired or is invalid/);
  });
});

describe("Gmail configuration guard", () => {
  it("refuses to build an auth URL when GOOGLE_CLIENT_ID/SECRET aren't set", async () => {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      // Credentials have been configured for this run (e.g. after completing Google Cloud
      // Console setup) — this specific "not configured" guard no longer applies, skip it.
      return;
    }
    const { getAuthUrl, signConnectState } = await import("../src/services/gmailAuth.service.js");
    expect(() => getAuthUrl(signConnectState("user_123"))).toThrow(/not configured/);
  });
});
