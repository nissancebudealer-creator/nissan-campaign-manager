import request from "supertest";
import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-at-least-16-chars";
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
});

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
