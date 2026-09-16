# Setup

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database — recommended: a free [Supabase](https://supabase.com) project
  (Project Settings → Database → Connection string → URI, "Session pooler" mode). Self-hosted
  Postgres works too.

## 1. Install dependencies

From the project root:

```bash
npm install
```

This installs both `server/` and `web/` via npm workspaces.

## 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Fill in at minimum:

- `DATABASE_URL` — your Postgres connection string
- `JWT_SECRET`, `UNSUBSCRIBE_SECRET` — generate each with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `ENCRYPTION_KEY` — must be exactly 64 hex characters (32 bytes), generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `FRONTEND_URL` — where the SPA runs (default `http://localhost:5174` is fine for local dev)

- `VIBER_INVITE_SECRET` — generate with the same command as `UNSUBSCRIBE_SECRET` above. Signs the
  "subscribe on Viber" invite-link tokens (Phase 7).

There's nothing to fill in for WhatsApp or Viber here — unlike Gmail, those credentials aren't
environment variables at all. They're entered through the **Integrations** screen once the app is
running (see below), and stored encrypted in the database per-integration. The server starts fine
with neither connected; sending on those channels just stays refused with a clear message until
you connect them.

### Gmail (Phase 6) — Google Cloud Console setup

Email sending needs a real OAuth2 Client ID/Secret from your own Google Cloud project. This is a
one-time setup only you can do (it needs your Google login):

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project
2. **APIs & Services → Library** → search "Gmail API" → **Enable**
3. **APIs & Services → OAuth consent screen** (shows as "Google Auth Platform" in newer UI):
   - User type **External** (or Internal if this is a Workspace account)
   - Fill in app name + your support/developer email, click through to Finish
   - Under **Audience → Test users**, add the Gmail address you'll actually send from — while the
     app is in "Testing" status, only these addresses can complete the consent flow (no full
     Google verification review needed for internal/small-scale use)
   - **Important**: under **Data Access**, click **Add or remove scopes** and explicitly add
     `https://www.googleapis.com/auth/gmail.send` **and**
     `https://www.googleapis.com/auth/gmail.readonly` (the second one is what lets the app read
     real bounce-notification emails back — see COMPLIANCE.md). Scopes that aren't registered here
     get silently dropped from the consent grant even if the app requests them — this bit us once
     during development (see ARCHITECTURE.md / memory notes) and shows up as a `403 Insufficient
     Permission` error from the Gmail API the first time you try to send or check for bounces, not
     at connect time. `gmail.readonly` is a Google "restricted" scope — while the app stays in
     "Testing" status with only your own test users added, no extra Google verification is needed;
     it only becomes required if you later publish the app for outside users.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type **Web application**
   - Authorized redirect URIs → add exactly `http://localhost:4000/api/integrations/gmail/callback`
     (or your deployed backend's equivalent URL)
   - Copy the **Client ID** and **Client Secret** into `server/.env` as `GOOGLE_CLIENT_ID` /
     `GOOGLE_CLIENT_SECRET`

Then in the app: **Integrations → Connect Gmail**. This does a real browser redirect to Google's
consent screen, so open the app in your own regular browser (not an automated one) and sign in
with the Gmail address you added as a test user.

### WhatsApp (Phase 7) — Meta Business setup

No OAuth flow — you paste in credentials generated from Meta's own dashboards, and the app tests
them for real before saving. This has real costs and a verification step Meta controls, not
something this app can shortcut:

1. [developers.facebook.com](https://developers.facebook.com) → create a Meta App → add the
   **WhatsApp** product.
2. In the WhatsApp product's **API Setup** page, note your **Phone Number ID** and generate a
   **System User access token** (Business Settings → System Users → your system user → Generate
   token, with `whatsapp_business_messaging` permission) — the temporary token shown on the API
   Setup page expires in 24h, so use a System User token for anything beyond a quick test.
3. Under **WhatsApp → Message Templates**, create and submit for approval the templates you intend
   to send marketing campaigns with. Meta reviews these; approval isn't instant.
4. Complete **Meta Business Verification** (Business Settings → Security Center) before sending to
   real customers outside a small test-number allowlist — required for production business-
   initiated messaging, not optional.
5. In the app: **Integrations → WhatsApp Business → Connect WhatsApp**, paste in the Phone Number
   ID and access token. The app calls Meta's Graph API to verify them immediately.
6. When building a campaign on the `WHATSAPP` channel, set **Template name** to the exact approved
   template's name (and language code) — sending is refused with a clear error if this is missing.

**Costs**: free for the first 1,000 conversations/month; billed per conversation after that at
Meta's published Philippines rates. Every number starts at a 250 messages/24h sending tier; Meta
raises this automatically as your number's quality rating and volume grow.

### Viber (Phase 7) — Public Account setup

1. Create a [Viber Public Account](https://partners.viber.com) for the dealership (or use an
   existing one) and get its **API/auth token** from the account's settings.
2. In the app: **Integrations → Viber → Connect Viber**, paste in the auth token and a sender name
   (shown to recipients). The app verifies the token with Viber and registers this app's webhook
   in the same step — no separate manual webhook setup needed.
3. Viber will only let you message a contact who has already messaged your Public Account —
   there's no way to send to a phone number cold, by design of the platform. To get a lead started:
   open that contact's record on the **Contacts** page and click **Viber link** to copy a personal
   invite link, then share it with the lead however you normally would (SMS, in person, etc). Once
   they tap it and message your account, they show up as subscribed automatically.
4. For larger promotional volume, Viber typically expects a **Viber Business Solution Provider
   (BSP)** contract (e.g. Infobip) rather than direct self-serve access — check current requirements
   at [partners.viber.com](https://partners.viber.com) for your expected volume.

## 3. Set up the database

```bash
npm run --workspace server prisma:generate
npm run --workspace server prisma:migrate
npm run --workspace server prisma:seed
```

This creates all tables and seeds the six roles (`ADMINISTRATOR`, `MARKETING_MANAGER`,
`MARKETING_STAFF`, `SALES_MANAGER`, `SALES_STAFF`, `VIEWER`) and their permission keys.

## 4. Run the app

Two terminals:

```bash
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:5174
```

Open http://localhost:5174. The first account you register becomes the Administrator.

## 5. Run tests

```bash
npm run test:server
```

Auth utilities, RBAC middleware, and the Gmail helper functions (crypto, MIME building,
personalization, unsubscribe tokens) are unit-tested without a live database or a real Google
account. The `*.integration.test.ts` files run against the real `DATABASE_URL` configured in
`server/.env` — safe to run repeatedly against a shared dev database since all test data uses a
`@phaseNtest.example` marker domain and is cleaned up in `afterAll`. They need a real Postgres
connection to pass, so make sure `DATABASE_URL` is set to a real instance (not the placeholder)
before running the suite. Network round-trips to a remote database make this slower than typical
unit tests — `vitest.config.ts` sets generous per-test/hook timeouts to accommodate that, and
(as of Phase 10) runs test *files* one at a time rather than in parallel
(`fileParallelism: false`): each integration test file opens its own real database connection, and
running them concurrently against Supabase's free-tier session pooler (a 15-connection cap, shared
by everything) caused genuine, reproducible connection exhaustion once the suite grew past ~10
files — not occasional flakiness, a real capacity problem. Running files sequentially trades total
wall-clock time (the full suite takes several minutes now, not under two) for the whole suite
passing reliably. If you ever see `Timed out fetching a new connection from the connection pool`,
that's this same class of issue — check `fileParallelism` hasn't been re-enabled and that
`server/src/lib/prisma.ts`'s test-mode `connection_limit` is still in place before assuming it's
network flakiness. The "refuses to send without a connected integration" test doesn't hardcode a
channel — as
of Phase 7, Gmail/WhatsApp/Viber can all be genuinely connected in a live dev database, so it looks
up which channel (if any) is currently unconnected and tests against that one, the same way the
Phase 6 comment used to describe testing against `WHATSAPP` specifically before it could be
connected too. The WhatsApp/Viber send tests use deliberately invalid credentials against a
test-only integration row, so a real send attempt is genuinely rejected by the provider rather than
needing a real account for this phase.

## Troubleshooting

- **"Invalid environment configuration" on server start**: check `server/.env` has both
  `DATABASE_URL` and a `JWT_SECRET` of at least 16 characters.
- **Prisma migrate fails to connect**: confirm your Supabase project isn't paused (free tier
  pauses after ~1 week idle — click "Restore" in the Supabase dashboard) and that you're using
  the pooled connection string, not the direct one, if connecting from a serverless host later.
- **CORS errors in the browser**: confirm `CORS_ORIGIN` in `server/.env` matches the URL the
  frontend is actually running on (default `http://localhost:5174`).
- **A campaign's image doesn't show, or Reports never records an open/click, for a real
  recipient** (as opposed to a test-send you open yourself, on this same machine): this is not a
  send failure — check the server log for a `getBackendOrigin() is falling back to localhost`
  warning. The image URL, tracking pixel, and click-redirect link embedded in every email are all
  built from `PUBLIC_APP_URL` (or, if that's unset, `GOOGLE_REDIRECT_URI`'s origin) — while that's
  still `http://localhost:4000`, only someone opening the email on this exact machine can reach
  any of the three; a real customer's device has no route to your `localhost`. Set `PUBLIC_APP_URL`
  to this server's actual public URL once deployed — see DEPLOYMENT.md.
