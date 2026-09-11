# Architecture

## System overview

Two deployables:

1. **`server/`** — a stateless REST API (Node.js/TypeScript/Express/Prisma) that owns the
   database, authentication, business rules, and all outbound integrations.
2. **`web/`** — a React SPA that talks to the API only, never directly to Gmail/WhatsApp/Viber or
   the database.

Design principle for channel integrations: every provider (Gmail, WhatsApp, Viber) is gated the
same way — a channel that isn't `CONNECTED` in the Integrations screen simply refuses to send
(`409`), never fabricating a result, and consent/suppression/audience math
(`deliverableWhere`/`channelAddressWhere` in `campaign.service.ts`) is fully channel-generic.

**Revised from the original plan (Phase 7):** the initial design called for every provider to sit
behind one polymorphic `ChannelProvider.send()` interface so the campaign engine would never
branch on channel type. Building the real WhatsApp and Viber adapters showed that assumption didn't
hold: WhatsApp marketing sends require a Meta-approved *template* (name + positional variables),
not an arbitrary message body, and Viber can only message a contact who has a captured `viberUserId`
(a real Viber id, obtained only via webhook after the contact subscribes) rather than a phone
number. Both are real platform constraints, not implementation gaps — see below and COMPLIANCE.md.
Rather than force a common interface that would hide those differences (and risk quietly sending
something a provider would reject), `requestSend()` in `campaign.service.ts` branches once, per
channel, at the point where those differences actually matter — audience resolution, content
building, and the provider call — while everything else (lifecycle, scheduling, tracking,
analytics) stays fully shared.

## Data model

Defined in `server/prisma/schema.prisma`. Core tables (Phase 1):

- `users`, `roles`, `permissions`, `role_permissions` — auth & RBAC
- `contacts`, `tags`, `contact_tags` — CRM core
- `consents`, `suppression_list` — compliance (per-contact, per-channel opt-in/opt-out with audit trail)
- `segments` — saved audience rule sets (JSON rule tree)
- `templates` — reusable message content by channel/category
- `campaigns`, `campaign_recipients`, `campaign_messages`, `campaign_tags` — campaign lifecycle and per-recipient delivery tracking
- `integrations` — per-channel connection config/status (Gmail OAuth tokens, WhatsApp/Viber credentials — encrypted at rest)
- `automation_rules` — cadence sequences (day-offset → template/channel steps)
- `audit_logs` — who did what, when

Every table has `id` (cuid), timestamps, and explicit foreign keys — see the schema file for the
authoritative definitions, indexes, and enums (`CampaignStatus`, `RecipientStatus`,
`ConsentChannel`, `IntegrationStatus`, etc).

## Roles

`ADMINISTRATOR`, `MARKETING_MANAGER`, `MARKETING_STAFF`, `SALES_MANAGER`, `SALES_STAFF`,
`VIEWER` — seeded by `server/prisma/seed.ts`. The first user to register on a fresh database
becomes `ADMINISTRATOR`; every subsequent signup defaults to `VIEWER` until an admin promotes
them from the Administration module (Phase 10).

**What's actually enforced, worth being precise about**: every route in this app checks the
requesting user's role *name* directly — `requireRole(...CAN_WRITE_CAMPAIGNS)` and similar groups
in `server/src/config/roles.ts`. The schema also has `Permission`/`RolePermission` tables (seeded
by `seed.ts`, granting every permission to `ADMINISTRATOR` and nothing to the rest) — these exist
but **no route guard consults them**; they're not live configuration. Administration's Roles tab
deliberately shows the real, computed grants from `config/roles.ts` instead of that inert seed
data, precisely to avoid a screen implying an admin can change access by editing something that
wouldn't actually take effect — see COMPLIANCE.md's fabricated-functionality principle, which
applies here just as much as it does to a "Connected" badge or an analytics number.

## Phased roadmap

| Phase | Scope |
|---|---|
| 1 ✅ | Foundation: scaffold, schema, auth + RBAC, routed UI shell |
| 2 ✅ | Contacts CRM: CRUD, CSV import/export with validation, tagging, consent fields |
| 3 ✅ | Segment builder (visual rule builder over contact fields) |
| 4 ✅ | Template library (categories, channel-specific fields, personalization variables) |
| 5 ✅ | Campaign builder: draft/preview/schedule/duplicate/pause/cancel, pre-send confirmation. Test-send/Send-now are wired up but always refuse until Phase 6 |
| 6 ✅ | Gmail integration: OAuth2 connect, send, rate limiting, retry, unsubscribe, sending logs |
| 7 ✅ | WhatsApp + Viber integration screens and provider adapters (send still gated on your Meta Business verification / Viber Business account, since this app can't grant those) |
| 8 ✅ | Dashboard & campaign analytics from real provider data only |
| 9 ✅ | Automation: cadence engine respecting consent + rate limits |
| 10 ✅ | Administration: user/role management, audit log viewer, system settings |

**All 10 phases are now complete.**

Each phase is built, run, and tested (typecheck, unit tests, manual UI check in-browser) before
the next begins.

## Why "Send" honestly refuses instead of faking it

The campaign builder is fully functional — draft, preview, audience targeting, scheduling,
pause/cancel, duplicate — because all of that is pure application logic. Actually delivering a
message requires a real, connected channel provider. `POST /api/campaigns/:id/send` checks for a
`CONNECTED` row in the `integrations` table for the campaign's channel; with none connected it
returns a clear `409` explaining why, rather than faking a "Sent!" state or writing make-believe
`CampaignRecipient` rows — see COMPLIANCE.md's "no fabricated metrics" rule. This was proven out in
practice during Phase 5 (no channel connected yet, `EMAIL` correctly refused) and again in Phase 6
once Gmail was actually connected — the exact same send code path started genuinely delivering
mail with zero changes to the campaign builder itself, exactly as designed. `WHATSAPP`/`VIBER`
still refuse today (`501`) since no provider adapter exists for them yet — that's Phase 7.

## Gmail integration (Phase 6) — how it actually works

- **OAuth2, never a password.** `server/src/services/gmailAuth.service.ts` runs the standard
  Google OAuth2 authorization-code flow (`googleapis` package) requesting only `gmail.send` +
  `userinfo.email`. The refresh/access token pair is encrypted at rest (AES-256-GCM, a dedicated
  `ENCRYPTION_KEY`, see `server/src/lib/crypto.ts`) inside `Integration.config` — the API never
  returns that field to the frontend (`integration.service.ts` explicitly selects it out).
- **CSRF-safe connect flow.** The frontend calls `GET /api/integrations/gmail/connect` (an
  authenticated fetch) to get a Google consent URL, rather than navigating directly to a
  backend route with the JWT in the URL. The URL's `state` param is a short-lived signed token
  (`signConnectState`/`verifyConnectState`) carrying who initiated the connect — Google's
  redirect back to `/gmail/callback` has no Authorization header or cookie, so this is the only
  way the callback knows which user to attribute the connection to.
- **Rate limiting is enforced, not just displayed.** `gmailSend.service.ts` tracks a rolling daily
  send counter inside the encrypted config and refuses once it hits Gmail's documented ceiling
  (`gmailLimits.ts`: 500/day consumer, 2000/day Workspace) rather than retrying into a suspension.
  Transient errors (429/5xx) get exponential-backoff retries (`MAX_SEND_RETRIES`); a hard daily-
  limit rejection stops the whole send loop immediately instead of generating identical failures
  for every remaining recipient.
- **Personalization happens server-side with real data** (`renderPersonalization` in
  `personalization.ts`) — the frontend's sample-data preview is cosmetic only; what a real
  recipient gets is substituted from their actual Contact row at send time.
- **Every outgoing email carries a working unsubscribe link** (`unsubscribe.service.ts`): a
  signed, tamper-resistant token (contact id + channel, HMAC'd with a dedicated
  `UNSUBSCRIBE_SECRET`) behind a public `GET /api/unsubscribe` route that opts the contact out and
  adds them to the suppression list — no authentication, no app dependency, works even if the
  recipient never logs into anything.
- **One important limitation, by design:** campaign sending is synchronous within the HTTP
  request (a loop over recipients with a pacing delay) — fine for the list sizes a dealership
  marketing team sends today, but a real background job queue (candidate: BullMQ + a free Redis
  tier) is the right upgrade before very large campaigns. Phase 9's automation engine took a
  different path for its own scheduling need (see below) rather than adopting that queue —
  automation's problem (checking every 5 minutes if anything is due) doesn't need one.

## WhatsApp & Viber integration (Phase 7) — how it actually works

Neither channel has anything like Gmail's OAuth flow. Both are configured by pasting a real
credential into the Integrations screen, which is tested against the provider's own API before
ever being marked `CONNECTED` — never trusted blindly.

- **WhatsApp (Meta Cloud API)**: `server/src/services/whatsapp.service.ts`. Configuring it saves a
  Phone Number ID + a Meta System User access token and calls `GET /{phone-number-id}` on Meta's
  Graph API to confirm they're real before saving. Sending
  (`sendWhatsAppTemplateMessage`) always sends a `type: "template"` message — **never** free text —
  because Meta only allows business-initiated marketing messages through a template it has
  pre-approved; the campaign's own message body is used only for the in-app preview and to derive
  which personalization tokens map positionally to the template's `{{1}}, {{2}}, ...` variables
  (`extractUsedVariables`). A campaign with no `whatsappTemplateName` set is refused at send time
  (`400`) rather than attempting a free-text send Meta would reject anyway. Rate limiting defaults
  to Meta's Tier 1 (250 messages/24h) — see `config/messagingLimits.ts` — since every number starts
  there and Meta raises it automatically as quality/volume grow.
- **Viber (Public Account API)**: `server/src/services/viber.service.ts`. Configuring it saves a
  Public Account auth token, verifies it via `get_account_info`, and — in the same step — registers
  our webhook (`set_webhook`) so subscriber events start flowing immediately, not as a separate
  manual step. **The load-bearing constraint**: Viber will only let a Public Account message a user
  who has already messaged it first. This app never sends to a raw phone number
  (`Contact.viberNumber` is not sendable) — only to a real `Contact.viberUserId`, which is populated
  exclusively by the webhook handler (`handleWebhookEvent`) once a contact actually subscribes.
  - **Invite-link attribution**: `buildViberInviteLink` produces a `viber://pa?...&context=<signed
    token>` deep link for one specific contact (shareable via SMS, in person, etc — outside this
    app). The `context` param is an HMAC-signed contact id (`VIBER_INVITE_SECRET`); Viber echoes it
    back verbatim in the resulting `conversation_started` webhook event, which is how the new
    subscriber's real Viber id gets attributed to the correct `Contact` row without ever guessing.
    An unrecognized/forged context is silently ignored, never trusted.
  - **Webhook signature verification**: Viber HMAC-signs every webhook body with your auth token
    (`X-Viber-Content-Signature`); `verifyWebhookSignature` checks it against the *raw* request
    bytes (captured by `express.json({ verify })` in `app.ts`, since re-serializing the parsed
    object wouldn't reliably reproduce the same bytes) before anything in the payload is trusted.
  - Unsubscribing clears `viberUserId` immediately, so a revoked opt-in can never still receive a
    send — this happens automatically from the webhook, not just from the in-app consent UI.
- **Audience math is channel-generic but address-aware**: `previewAudience` already required a
  recorded opt-in per channel (Phase 6); Phase 7 adds `channelAddressWhere` — a contact can be
  fully consented and still excluded from an estimate as `noAddressCount` if they're missing the
  actual deliverable identifier for that channel (no WhatsApp number on file, or not yet subscribed
  on Viber). This is a distinct, additive bucket from "no consent" or "opted out" — see the
  Reports/campaign-builder audience panel.
- **Test send is Email-only.** WhatsApp templates can only be verified against Meta's own
  pre-registered test numbers (configured in Meta Business Manager, not selectable at runtime by
  this app), and Viber has no concept of a test send separate from messaging a real subscriber —
  `requestSend` refuses test-mode for both with a clear `400` explaining why, rather than faking a
  test result.

## Analytics & tracking (Phase 8) — how it actually works

- **No fabricated metrics, extended to opens/clicks.** Phase 6 already refused to fake a "Sent"
  state without a real provider response; Phase 8 applies the same rule to engagement. "Opened"
  and "Clicked" are only ever set by a real inbound HTTP request from the recipient's own mail
  client — never inferred, estimated, or defaulted to a percentage.
- **Open tracking**: every real send embeds a 1x1 transparent GIF (`buildOpenPixelUrl` in
  `server/src/services/tracking.service.ts`) pointing at `GET /api/track/open/:recipientId.gif`,
  a public (no-auth) route. When the recipient's mail client renders the image, that request marks
  the `CampaignRecipient` `OPENED` — a standard technique every ESP uses, not something specific
  to this build, and the same reason "open rate" is always an undercount industry-wide (many mail
  clients block remote images by default).
- **Click tracking**: the campaign's CTA link is rewritten to `GET /api/track/click/:recipientId`
  (`buildClickUrl`). That route marks `CLICKED` and then looks up the campaign's real `ctaUrl`
  **server-side** before issuing a `302` — the destination is never taken from the request itself,
  which is what keeps this from being an open-redirect vector.
- **Monotonic status, never downgraded.** A `CampaignRecipient.status` only ever moves forward
  (`SENT` → `OPENED` → `CLICKED`); a late-firing open pixel after a click has already been recorded
  cannot regress the status back to `OPENED` (`recordOpen` checks `STATUS_RANK` before writing).
- **"Sent" counts everyone the provider ever accepted**, including recipients who progressed to
  `OPENED`/`CLICKED` — not just rows currently sitting at the `SENT` status. This was a real bug
  found during Phase 8 verification (see COMPLIANCE.md) and is now covered by an integration test.
- **Two numbers are deliberately never shown**: "Delivered" (Gmail's send API confirms acceptance,
  not final inbox delivery) and "Conversion" (no goal/e-commerce integration exists to attribute
  one to a send). The Reports UI states this explicitly rather than silently omitting it.
- **Dashboard and Reports are pure read-models** (`analytics.service.ts`) over
  `campaign_recipients` — no caching, no pre-aggregation, no scheduled rollups. Every page load is
  a fresh live query, so the numbers can never drift out of sync with the underlying data.

## Automation (Phase 9) — how it actually works

A cadence engine needs something no prior phase did: a step must fire on its own, days after
enrollment, with nothing driving it from an HTTP request. `server/src/services/automation.service.ts`
is the whole engine; everything else is data model and a thin scheduler around it.

- **Trigger types are a small fixed set** (`config/automationTriggers.ts`): `NEW_CONTACT`,
  `LEAD_STATUS_CHANGED` (fires only on an actual transition *into* the target status — updating an
  already-`Hot` contact's notes doesn't re-fire it), and `MANUAL_ONLY` (a staff member enrolls a
  contact by hand from the Contacts page). `contact.service.ts` calls into
  `evaluateNewContactTrigger`/`evaluateLeadStatusTrigger` after a real create/update — including
  the bulk lead-status-update path, which uses `updateMany` and would otherwise silently bypass
  triggers entirely.
- **One enrollment row per (rule, contact), enforced by a unique constraint** — a trigger firing
  twice (e.g. two rapid lead-status edits) can never double-enroll the same contact; the second
  attempt's unique-constraint violation (`P2002`) is caught and treated as a no-op, not an error.
  The same function also catches a foreign-key violation (`P2003`) — the rule being deleted in the
  window between "query active rules" and "insert the enrollment" (found via a genuine cross-test
  race during Phase 10's test suite, not a hypothetical: a real admin deleting/deactivating a rule
  at the same moment a contact is created or updated elsewhere would hit this too). Either way, a
  contact create/update must never fail because of an unrelated, concurrent action on an
  automation rule — both cases are skipped silently, the same as an already-enrolled contact.
- **Steps reuse the exact same send adapters as campaigns** (`sendEmailViaGmail`,
  `sendWhatsAppTemplateMessage`, `sendViberMessage`) — daily rate limits and the WhatsApp-template /
  Viber-subscription requirements from Phases 6-7 apply identically here. There is no separate,
  weaker "automation send" code path.
- **Consent is re-checked at send time, not just at enrollment.** A contact enrolled while opted in
  who unsubscribes before their step comes due is honestly `SKIPPED` (logged in
  `AutomationStepLog`, never sent) rather than the enrollment silently going stale or, worse, still
  sending. `SKIPPED` (consent/address failed) and `FAILED` (a real provider call was attempted and
  rejected — e.g. a daily limit) are handled differently on purpose: a skip advances to the next
  step (this specific step will never become deliverable in the past), while a failure leaves the
  step pending and retries after a cooldown (the contact never actually received it).
- **No background job queue** (BullMQ/Redis) — a `setInterval` in `index.ts` checks every 5 minutes
  for due steps. Zero new cost, zero new infrastructure. **Real, stated limitation**: on a free-tier
  host that spins down when idle (see DEPLOYMENT.md), this stops running along with the rest of the
  process until something wakes it. `POST /api/automation-rules/run-now` (also a "Run now" button
  in the UI) exists so a free external cron pinger can guarantee execution in that deployment
  shape — same zero-cost pattern as the rest of this app, just decoupled from the server staying
  warm.

## Administration (Phase 10) — how it actually works

Everything here (`server/src/services/admin.service.ts`) is real, changes real behavior, and is
restricted to `ADMINISTRATOR` only (`CAN_MANAGE_ADMIN` — not shared with Marketing Manager the way
most other write groups are, since this is the most sensitive surface in the app).

- **User management** is the one piece that directly changes existing enforcement: assigning a
  role here is the exact same `roleId` every `requireRole` check already reads. Creating a user
  hashes the password immediately (`bcryptjs`, matching registration); resetting one works the
  same way — the plaintext never touches a log or an email, the admin communicates it directly.
  There is deliberately no "delete user" — `AuditLog.userId` and every `createdBy`-style relation
  point at `User`, so a user is deactivated (`isActive: false`, already blocks login), never
  deleted, the same "cancel, don't destroy" philosophy as campaigns and automation rules.
- **The last-Administrator guard**: any update that would leave zero active Administrators
  system-wide (demoting or deactivating the only one) is refused (`409`) before it happens —
  there would be no one left to undo it. Checked by counting *other* active Administrators, so a
  legitimate change (there are two or more) is never blocked.
- **Roles tab**: read-only, deliberately not an editor — see the "Roles" section above for why
  showing the inert `Permission`/`RolePermission` seed data as if it were live configuration would
  itself be a compliance violation by this project's own "no fabricated functionality" standard.
  What's shown is computed by checking role-name membership in each `CAN_*` array live, every
  load — it can't silently drift out of sync with what routes actually enforce, because it's
  reading the exact same source those routes read.
- **Audit log viewer**: a real read/filter UI over `AuditLog`, which every phase since Phase 1 has
  already been writing to via `recordAudit()` on every write action — Phase 10 added nothing to
  what gets recorded, only a way to see it. `AuditLog.userId` is `ON DELETE SET NULL`, so a
  deactivated (or, in test cleanup, deleted) user's history entries persist attributed to no one
  ("System") rather than disappearing.
- **Sending limits**: `Integration.config`'s `dailyLimit` field already existed per-channel since
  Phase 6-7 (WhatsApp/Viber) with no admin-facing way to change it — permanently stuck at the
  conservative default with no path to raise it once a provider actually confirmed a higher tier,
  despite the UI copy already saying to do exactly that. Phase 10 closes that gap for all three
  channels (Gmail's config gained the same optional override) and gives it a real control. Editing
  the number here never bypasses a provider's actual limit — it only changes what this app itself
  will attempt before refusing, so setting it too high just means the provider rejects the send
  for real instead of this app stopping early.

## Why these free-tier choices

- **Supabase** over self-hosted Postgres: this sandbox has no Docker/psql available, and
  Supabase's free tier (500MB, hosted, includes connection pooling) removes the need for you to
  run and patch a database server yourself. Self-hosted Postgres remains a drop-in alternative —
  just change `DATABASE_URL`.
- **Express over a heavier framework** (NestJS, etc.): fewer moving parts for a small internal
  tool, faster to reason about, still fully TypeScript.
- **JWT auth** rather than a paid auth provider (Auth0, Clerk): zero-cost, and this is an
  internal tool with a small, known user base — no need for social login or magic links.
