import request from "supertest";
import { describe, expect, it } from "vitest";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Importing ../src/app.js wires up every route, which transitively constructs the shared Prisma
// client singleton (lib/prisma.js) as a module-load side effect — that singleton is cached and
// reused by every other test file in this run (fileParallelism: false = one process). A fake,
// unreachable DATABASE_URL here would silently poison it for whichever file happens to need the
// real database next, even though this file's own test never queries anything. Load the same real
// .env every integration test file uses, so this can never be the file that does that.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedEnv = loadDotenv({ path: path.resolve(__dirname, "../.env") }).parsed;
if (parsedEnv?.DATABASE_URL) process.env.DATABASE_URL = parsedEnv.DATABASE_URL;
if (parsedEnv?.JWT_SECRET) process.env.JWT_SECRET = parsedEnv.JWT_SECRET;

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
