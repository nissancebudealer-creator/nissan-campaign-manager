import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { runDueSteps } from "./services/automation.service.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`API server listening on http://localhost:${env.PORT}`);
});

// No background job queue (see ARCHITECTURE.md) — a simple in-process interval is the zero-cost
// default. Real limitation: on a free-tier host that spins down when idle, this stops running
// along with the rest of the process until something wakes it — POST /api/automation-rules/run-now
// exists so a free external cron pinger can guarantee execution in that deployment shape.
const AUTOMATION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  runDueSteps().catch((err) => {
    logger.error("Automation runner tick failed", { message: err instanceof Error ? err.message : String(err) });
  });
}, AUTOMATION_CHECK_INTERVAL_MS);
