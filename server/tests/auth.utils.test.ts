import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-at-least-16-chars";
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
});

describe("password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const { hashPassword, verifyPassword } = await import("../src/utils/password.js");
    const hash = await hashPassword("Sup3rSecret!");
    expect(hash).not.toBe("Sup3rSecret!");
    await expect(verifyPassword("Sup3rSecret!", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});

describe("JWT auth tokens", () => {
  it("signs and verifies a token round-trip", async () => {
    const { signAuthToken, verifyAuthToken } = await import("../src/utils/jwt.js");
    const token = signAuthToken({ sub: "user_1", email: "a@b.com", role: "ADMINISTRATOR" });
    const payload = verifyAuthToken(token);
    expect(payload.sub).toBe("user_1");
    expect(payload.email).toBe("a@b.com");
    expect(payload.role).toBe("ADMINISTRATOR");
  });

  it("rejects a tampered token", async () => {
    const { signAuthToken, verifyAuthToken } = await import("../src/utils/jwt.js");
    const token = signAuthToken({ sub: "user_1", email: "a@b.com", role: "VIEWER" });
    expect(() => verifyAuthToken(token + "x")).toThrow();
  });
});
