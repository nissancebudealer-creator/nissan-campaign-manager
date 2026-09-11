import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma's default connection pool size is `num_physical_cpus * 2 + 1` *per client instance*.
// That's harmless for the single running server process, but the integration test suite spins up
// one PrismaClient per test file. Past a certain suite size (confirmed during Phase 10: a real
// "Can't reach database server" plus cascading test timeouts in the same run, not independent
// blips) that stops being occasional network flakiness and becomes deterministic connection-pool
// exhaustion against Supabase's free-tier session pooler, which caps at 15 total connections.
// vitest.config.ts's `fileParallelism: false` is the primary fix (only one test file's client is
// ever active at a time), so this only needs to cap the *intra-file* concurrency a single file's
// own `Promise.all([...])`-style queries can use — capped at 1 (serialize every query in a
// process) caused real "Timed out fetching a new connection from the pool" failures instead, so 5
// is the safe floor: enough headroom for this codebase's existing concurrent-query patterns
// (e.g. `previewAudience`'s five-way Promise.all) without ever approaching Supabase's real cap.
function withPoolLimit(url: string, limit: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}connection_limit=${limit}`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    process.env.NODE_ENV === "test"
      ? { datasources: { db: { url: withPoolLimit(process.env.DATABASE_URL!, 5) } } }
      : undefined,
  );

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
