import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Some tests hit the real Supabase database over the network (see
    // tests/contacts.integration.test.ts) — the 5s default is too tight for that round-trip.
    testTimeout: 20000,
    // beforeAll hooks that seed several contacts (multiple sequential round-trips to Supabase)
    // need more headroom than a single test.
    hookTimeout: 45000,
    // Every *.integration.test.ts file opens its own real PrismaClient against Supabase's
    // free-tier session pooler (15-connection cap total, shared across everything). Running test
    // files in parallel (vitest's default) multiplies that per-file pool by however many files
    // run concurrently — confirmed during Phase 10 to cause real, deterministic connection
    // exhaustion once the suite grew past ~10 files, not just occasional network flakiness. Only
    // one file's client is ever active at a time this way — slower wall-clock for the whole
    // suite, but each file gets the database entirely to itself, which is what actually matters
    // for a small dealership-scale test suite run in CI/background rather than interactively.
    fileParallelism: false,
  },
});
