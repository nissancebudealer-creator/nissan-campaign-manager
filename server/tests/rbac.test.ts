import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Permission checks are genuinely database-backed now (see permission.service.ts) — no mocking
// the database, per this project's established convention (a mocked check here would prove
// nothing about whether a real, seeded role actually has the permission it's supposed to). This
// runs against the real Supabase database configured in server/.env, reading the live-seeded
// ADMINISTRATOR/VIEWER grants rather than any test-created data, so nothing needs cleanup.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
if (parsedEnv?.JWT_SECRET) process.env.JWT_SECRET = parsedEnv.JWT_SECRET;

describe("RBAC middleware", () => {
  it("blocks unauthenticated requests", async () => {
    const { requireAuth } = await import("../src/middleware/auth.js");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const app = express();
    app.get("/protected", requireAuth, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("allows a role with the real, seeded permission and blocks one without it", async () => {
    const { requireAuth, requirePermission } = await import("../src/middleware/auth.js");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { signAuthToken } = await import("../src/utils/jwt.js");
    const app = express();
    app.get(
      "/admin-only",
      requireAuth,
      requirePermission("admin:manage"),
      (_req, res) => res.json({ ok: true }),
    );
    app.use(errorHandler);

    // VIEWER is seeded with zero write/admin permissions — see prisma/seed.ts.
    const viewerToken = signAuthToken({ sub: "u1", email: "v@x.com", role: "VIEWER" });
    const forbidden = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(forbidden.status).toBe(403);

    // ADMINISTRATOR is seeded with every permission, including admin:manage.
    const adminToken = signAuthToken({ sub: "u2", email: "a@x.com", role: "ADMINISTRATOR" });
    const allowed = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(allowed.status).toBe(200);
  }, 15000);

  it("blocks a request for a permission key that doesn't exist", async () => {
    const { requireAuth, requirePermission } = await import("../src/middleware/auth.js");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { signAuthToken } = await import("../src/utils/jwt.js");
    const app = express();
    app.get(
      "/nonexistent-permission",
      requireAuth,
      requirePermission("not:a-real-key"),
      (_req, res) => res.json({ ok: true }),
    );
    app.use(errorHandler);

    const adminToken = signAuthToken({ sub: "u3", email: "a2@x.com", role: "ADMINISTRATOR" });
    const res = await request(app)
      .get("/nonexistent-permission")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  }, 15000);
});
