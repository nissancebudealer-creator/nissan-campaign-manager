# Deployment (free-tier)

This guide targets a zero/low-cost deployment. Phases 6-7 added integrations that need production
callback URLs — deploy to a stable URL before connecting them for real:

- Gmail OAuth redirect (`GOOGLE_REDIRECT_URI`)
- Viber's webhook (registered automatically at `{backend URL}/api/webhooks/viber` when you connect
  Viber in Integrations — see SETUP.md). If you reconnect Viber after changing the backend's public
  URL, disconnect and reconnect so the webhook re-registers at the new address.
- WhatsApp has no required webhook for sending (only for optional future delivery-status
  ingestion), so nothing to configure there beyond the Phone Number ID/access token itself.

## Recommended free-tier layout

| Component | Service | Notes |
|---|---|---|
| Database | [Supabase](https://supabase.com) free tier | 500MB, pauses after ~1 week idle — fine for internal tools with regular use |
| API (`server/`) | [Render](https://render.com) or [Fly.io](https://fly.io) free tier | **Free web services on these platforms spin down after inactivity** and take ~30-60s to wake on the next request — acceptable for an internal marketing tool, not for anything needing instant response. Upgrade to a paid "always on" tier if that becomes a problem. |
| Frontend (`web/`) | [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.cloudflare.com) free tier | Static hosting, effectively unlimited for low-traffic internal use |

## Environment variables in production

Set the same variables as `server/.env.example` in your host's dashboard/secrets manager —
never commit `.env` or paste secrets into frontend code. `CORS_ORIGIN` must be updated to your
deployed frontend URL, and `GOOGLE_REDIRECT_URI` must use the deployed API's public URL.
WhatsApp/Viber have no environment variables at all — those credentials are entered through the
Integrations screen after deployment (see SETUP.md).

**Set `PUBLIC_APP_URL` to the deployed API's real public URL before sending any campaign to a
real recipient.** This one setting is embedded as the image URL, the open-tracking pixel, and the
click-redirect link in every campaign email — while it's unset in local dev, the app falls back to
`GOOGLE_REDIRECT_URI`'s origin (usually `http://localhost:4000`), which only works when the person
opening the email is on the same machine as the dev server. A real customer's browser has no way
to reach your `localhost`; the image will never load and Reports will never see an open or click,
even though nothing in the send itself failed. This is the #1 thing to check if images or
open/click tracking mysteriously don't work once you start sending to actual customers.

**Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` before uploading any campaign/template
image.** Uploaded images are stored in Supabase Storage, not on the API server's own disk —
Render's (and most free-tier hosts') filesystem is wiped on every redeploy, which would silently
break the image in any campaign already sent or drafted. Create a public bucket in your Supabase
project's Storage tab named to match `SUPABASE_STORAGE_BUCKET` (defaults to `campaign-images`),
then copy `SUPABASE_URL` and the `service_role` key from Project Settings > API. Without these set,
uploading an image returns a clear error rather than silently writing to disk.

## Build commands

```bash
npm run build:server   # tsc -> server/dist
npm run build:web      # vite build -> web/dist
```

`server/dist/index.js` is the production entry point (`npm start` inside `server/`).
`web/dist` is a static bundle to serve as-is.

## Automation (Phase 9) on a free-tier host

Automation's in-process scheduler (`setInterval` in `server/src/index.ts`, checking every 5
minutes for due steps) only runs while the server process is alive. On a free tier that spins
down after inactivity (see the table above), a scheduled step won't fire until some other request
wakes the server back up — it isn't lost, just delayed until the next wake. To guarantee timely
execution in production, point a free external scheduler (e.g.
[cron-job.org](https://cron-job.org), a scheduled GitHub Actions workflow, or your host's own free
cron feature if it has one) at `POST /api/automation-rules/run-now` every 5 minutes. That endpoint
requires a normal authenticated request like any other write in this API — the pinger needs to log
in (`POST /api/auth/login`) and reuse the resulting JWT for the duration of its token's validity
(`JWT_EXPIRES_IN`), the same as any other API client.

## Database migrations in production

```bash
npm run --workspace server prisma:migrate  -- deploy
```

(Use `prisma migrate deploy` rather than `migrate dev` in production — it applies existing
migrations without prompting or generating new ones.)

This document will grow with concrete platform-by-platform steps as later phases add
integration-specific requirements (OAuth redirect URIs, webhook endpoints).
