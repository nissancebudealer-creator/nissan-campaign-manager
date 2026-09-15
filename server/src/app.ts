import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { contactRouter } from "./routes/contact.routes.js";
import { tagRouter } from "./routes/tag.routes.js";
import { segmentRouter } from "./routes/segment.routes.js";
import { templateRouter } from "./routes/template.routes.js";
import { campaignRouter } from "./routes/campaign.routes.js";
import { integrationRouter } from "./routes/integration.routes.js";
import { unsubscribeRouter } from "./routes/unsubscribe.routes.js";
import { trackingRouter } from "./routes/tracking.routes.js";
import { dashboardRouter, reportsRouter } from "./routes/analytics.routes.js";
import { webhookRouter } from "./routes/webhook.routes.js";
import { automationRouter } from "./routes/automation.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { uploadRouter } from "./routes/upload.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { backupRouter } from "./routes/backup.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { UPLOADS_DIR, UPLOADS_URL_PATH } from "./config/uploads.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  // Captures the exact raw request bytes alongside the parsed body — Viber's webhook signature
  // (X-Viber-Content-Signature) is an HMAC over the raw JSON bytes, which re-serializing the
  // parsed object would not reliably reproduce.
  app.use(
    express.json({
      limit: "8mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/contacts", contactRouter);
  app.use("/api/tags", tagRouter);
  app.use("/api/segments", segmentRouter);
  app.use("/api/templates", templateRouter);
  app.use("/api/campaigns", campaignRouter);
  app.use("/api/integrations", integrationRouter);
  app.use("/api/unsubscribe", unsubscribeRouter);
  app.use("/api/track", trackingRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/webhooks", webhookRouter);
  app.use("/api/automation-rules", automationRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/uploads", uploadRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/admin/backup", backupRouter);

  // Uploaded campaign/template images — public and unauthenticated by necessity (an email client
  // or the recipient's browser fetches this directly, with no way to send our auth header), and
  // marked cross-origin so the web app's own live preview (a different origin in dev) can load it
  // despite helmet's default same-origin Cross-Origin-Resource-Policy.
  app.use(
    UPLOADS_URL_PATH,
    express.static(UPLOADS_DIR, {
      setHeaders: (res) => res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
