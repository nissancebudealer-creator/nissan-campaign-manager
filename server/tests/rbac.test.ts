import express from "express";
import request from "supertest";
import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-at-least-16-chars";
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
});

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

  it("allows a valid token but blocks the wrong role", async () => {
    const { requireAuth, requireRole } = await import("../src/middleware/auth.js");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { signAuthToken } = await import("../src/utils/jwt.js");
    const app = express();
    app.get(
      "/admin-only",
      requireAuth,
      requireRole("ADMINISTRATOR"),
      (_req, res) => res.json({ ok: true }),
    );
    app.use(errorHandler);

    const viewerToken = signAuthToken({ sub: "u1", email: "v@x.com", role: "VIEWER" });
    const forbidden = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(forbidden.status).toBe(403);

    const adminToken = signAuthToken({ sub: "u2", email: "a@x.com", role: "ADMINISTRATOR" });
    const allowed = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(allowed.status).toBe(200);
  });
});
