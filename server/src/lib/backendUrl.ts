import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let warnedAboutLocalhost = false;

// "Where this API is publicly reachable" for links embedded in outgoing emails (the campaign
// image, the open-tracking pixel, the click-redirect) and the uploaded-file URLs returned to the
// frontend — these all need an absolute URL a recipient's own mail client can fetch, not a
// relative path, and "localhost" in that URL means the RECIPIENT's own machine, not this server.
// Prefers the explicit PUBLIC_APP_URL; falls back to GOOGLE_REDIRECT_URI's origin (already
// required for Gmail OAuth, so usually already correct once deployed) and then to localhost for
// local dev, where it's genuinely correct for a same-machine test-send.
export function getBackendOrigin(): string {
  const origin = env.PUBLIC_APP_URL
    ? new URL(env.PUBLIC_APP_URL).origin
    : env.GOOGLE_REDIRECT_URI
      ? new URL(env.GOOGLE_REDIRECT_URI).origin
      : `http://localhost:${env.PORT}`;

  // Warn regardless of which branch produced it — GOOGLE_REDIRECT_URI is commonly left pointed
  // at localhost throughout local development (see SETUP.md's Gmail OAuth setup), so that branch
  // silently carrying a real-world send is exactly the failure mode this guards against, not just
  // the bare final fallback.
  const hostname = new URL(origin).hostname;
  if (!warnedAboutLocalhost && (hostname === "localhost" || hostname === "127.0.0.1")) {
    warnedAboutLocalhost = true;
    logger.warn(
      "getBackendOrigin() resolved to a localhost URL — images, tracking pixels, and click " +
        "links embedded in campaign emails will be unreachable for any recipient other than " +
        "this machine. Set PUBLIC_APP_URL to this server's real public URL before sending to " +
        "real recipients — see DEPLOYMENT.md.",
    );
  }
  return origin;
}
