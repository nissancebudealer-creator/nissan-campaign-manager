import { describe, expect, it } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These are pure crypto/JWT unit tests — no database query of their own — but the modules they
// import pull in config/env.ts, which validates DATABASE_URL at load time, and the Prisma client
// singleton (lib/prisma.js) is shared across every test file in this run (fileParallelism: false
// means one process, one singleton). A fake/unreachable DATABASE_URL here used to be harmless in
// isolation, but now that other files' real DB-backed permission checks (requirePermission) may
// initialize that same singleton from whatever this file leaves in process.env, a placeholder
// value would silently poison it for whichever file runs next. Load the same real .env every
// other integration test file uses, so this file can never be the one that does that.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
if (parsedEnv?.JWT_SECRET) process.env.JWT_SECRET = parsedEnv.JWT_SECRET;

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
