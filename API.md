# API Reference

Base URL: `/api`. All request/response bodies are JSON. Authenticated endpoints require
`Authorization: Bearer <token>`.

This file is updated as each phase adds endpoints. Currently implemented:

## Health

### `GET /api/health`

No auth required.

```json
{ "status": "ok", "time": "2026-09-09T12:00:00.000Z" }
```

## Auth

### `POST /api/auth/register`

Rate-limited (20 requests / 15 min per IP). The first user ever registered becomes
`ADMINISTRATOR`; all others default to `VIEWER`.

Request:
```json
{ "email": "you@example.com", "password": "at least 8 chars", "firstName": "Jo", "lastName": "Gahiton" }
```

Response `201`:
```json
{
  "token": "<jwt>",
  "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "...", "isActive": true, "role": "ADMINISTRATOR" }
}
```

Errors: `409` if the email is already registered, `400` on validation failure.

### `POST /api/auth/login`

Rate-limited (20 requests / 15 min per IP).

Request: `{ "email": "...", "password": "..." }`
Response `200`: same shape as register. `401` on invalid credentials or inactive account.

### `GET /api/auth/me`

Requires auth. Returns `{ "user": { ... } }` for the current token's owner.

## Contacts

All routes require auth. Write routes (`POST`/`PUT`) require `ADMINISTRATOR`, `MARKETING_MANAGER`,
`MARKETING_STAFF`, `SALES_MANAGER`, or `SALES_STAFF`. `DELETE` requires `ADMINISTRATOR` or
`MARKETING_MANAGER`. Everyone with a valid token (including `VIEWER`) can read.

### `GET /api/contacts?search=&customerType=&leadStatus=&tagId=&page=1&pageSize=25`

Returns `{ contacts: Contact[], total, page, pageSize }`. `search` matches first/last name,
email, company, and mobile number (case-insensitive).

### `GET /api/contacts/export?search=&customerType=&leadStatus=&tagId=`

Same filters as list, but returns every matching contact unpaginated as `{ contacts: Contact[] }`
— the frontend converts this to CSV client-side, nothing is written to disk server-side.

### `GET /api/contacts/:id`

Returns `{ contact }` including its tags, full consent history, and any suppression records.
`404` if not found.

### `POST /api/contacts`

Body: `{ firstName, lastName, company?, email?, mobileNumber?, whatsappNumber?, viberNumber?,
customerType?, productInterest?, location?, leadSource?, leadStatus?, notes?, tagIds?: string[] }`.
`409` if the email is already used by another contact.

### `PUT /api/contacts/:id`

Same body shape, all fields optional (partial update). Passing `tagIds` replaces the contact's
full tag set.

### `DELETE /api/contacts/:id`

`204` on success. Permanently removes the contact and its tag/consent/suppression rows (FK
cascade) — an audit log entry is written first, capturing name/email for the record.

### `POST /api/contacts/bulk`

Body: `{ contactIds: string[], addTagIds?: string[], removeTagIds?: string[], leadStatus?: string }`.
Applies to every id in `contactIds` in one call — used by the bulk-action bar in the Contacts UI.

### CSV import — `POST /api/contacts/import/preview` and `POST /api/contacts/import/commit`

Both take `{ dryRun: boolean, rows: Record<string,string>[] }` where each row uses the canonical
field names (`firstName`, `lastName`, `email`, …) — the frontend maps the user's CSV columns to
these before calling either endpoint.

`preview` never writes to the database; it returns `{ results: [{ rowNumber, data, status:
"valid"|"duplicate"|"invalid", errors? }], summary: { total, valid, duplicate, invalid } }` so the
UI can show a full preview before anything is committed.

`commit` re-validates server-side (never trusts a stale client-side preview) and only inserts rows
that come back `valid` — duplicates and invalid rows are silently skipped, not partially inserted.
Returns `{ created: number }`.

### Consent — `POST /api/contacts/:id/consent` and `GET /api/contacts/:id/consents`

`POST` body: `{ channel: "EMAIL"|"WHATSAPP"|"VIBER", optIn: boolean, consentSource?: string }`.
Writes a new (append-only) consent record and, as a side effect, adds the contact to that
channel's suppression list on opt-out or removes them on opt-in — see COMPLIANCE.md. `GET` returns
the full history for that contact, newest first.

## Tags

All routes require auth. `POST`/`DELETE` require `ADMINISTRATOR`, `MARKETING_MANAGER`, or
`MARKETING_STAFF`.

- `GET /api/tags` → `{ tags: Tag[] }`
- `POST /api/tags` — body `{ name, color? }`, `409` if the name already exists
- `DELETE /api/tags/:id` — `204`, also removes it from every contact via cascade

## Segments

All routes require auth. `POST`/`PUT` require `ADMINISTRATOR`, `MARKETING_MANAGER`, or
`MARKETING_STAFF`. `DELETE` requires `ADMINISTRATOR` or `MARKETING_MANAGER`.

A segment's `rulesJson` is `{ groups: [{ conditions: [{ field, operator, value }] }] }` — groups
are OR'd together, conditions within a group are AND'd. See `server/src/config/segmentFields.ts`
for the full field registry (customerType, leadStatus, leadSource, productInterest, location,
company, tag, consent_email, consent_whatsapp, consent_viber) and which operators each supports.

- `GET /api/segments` → `{ segments: Segment[] }`
- `GET /api/segments/:id` → `{ segment }`, `404` if not found
- `POST /api/segments` — body `{ name, description?, rules }`
- `PUT /api/segments/:id` — partial update, same body shape
- `DELETE /api/segments/:id` — `204`
- `GET /api/segments/:id/preview?page=&pageSize=` — runs the saved segment's rules against the
  live contact table, returns `{ contacts, total, page, pageSize }`
- `POST /api/segments/preview?page=&pageSize=` — body `{ rules }`, same response shape but for an
  unsaved rule set (used by the segment builder UI for live preview while editing)

## Templates

All routes require auth. `POST`/`PUT` require `ADMINISTRATOR`, `MARKETING_MANAGER`, or
`MARKETING_STAFF`. `DELETE` requires `ADMINISTRATOR` or `MARKETING_MANAGER`.

Categories are a fixed enum (`server/src/config/templateCategories.ts`): New Vehicle Promotion,
Service Promotion, Parts Promotion, Accessories Promotion, Financing Promotion, Event Invitation,
Test Drive Invitation, Customer Follow-Up, Birthday Greeting, Anniversary Greeting. Channel is
`EMAIL`/`WHATSAPP`/`VIBER`; `subject` is required (and only stored) for `EMAIL`.

`variables` is never taken from client input — the server scans `subject`+`body` for `{{token}}`
patterns and stores only the ones that match a supported personalization variable
(`server/src/config/personalization.ts`: `first_name`, `last_name`, `company`,
`product_interest`), so the stored list can never drift from what the template text actually
references.

- `GET /api/templates?category=&channel=` → `{ templates: Template[] }`
- `GET /api/templates/:id` → `{ template }`, `404` if not found
- `POST /api/templates` — body `{ name, category, channel, subject?, body, imageUrl?, ctaLabel?, ctaUrl? }`
  (`ctaLabel`/`ctaUrl` must be set together or not at all)
- `PUT /api/templates/:id` — partial update, same body shape
- `DELETE /api/templates/:id` — `204`

Personalization substitution for preview is done entirely client-side (`web/src/lib/personalization.ts`)
against sample data — no API round-trip needed for that.

## Campaigns

All routes require auth. `POST`/`PUT`/lifecycle actions require `ADMINISTRATOR`,
`MARKETING_MANAGER`, or `MARKETING_STAFF`. `DELETE` requires `ADMINISTRATOR` or
`MARKETING_MANAGER`.

A campaign always targets exactly one saved segment (`segmentId` required) — there is no "send to
all contacts" option, to keep targeting intentional. `type` reuses the same category enum as
templates. Editing is only allowed while a campaign is `DRAFT`, `SCHEDULED`, or `PAUSED`; once
`CANCELLED`/`SENT`/`FAILED` it's read-only.

- `GET /api/campaigns?status=&channel=` → `{ campaigns: Campaign[] }`
- `GET /api/campaigns/:id` → `{ campaign }`
- `POST /api/campaigns` — body `{ name, type, channel, segmentId, templateId?, subject?, message, imageUrl?, videoUrl?, ctaLabel?, ctaUrl?, whatsappTemplateName?, whatsappTemplateLanguage?, tagIds? }` — always created as `DRAFT`. `whatsappTemplateName`/`whatsappTemplateLanguage` are only persisted for `channel: "WHATSAPP"` (see below).
- `PUT /api/campaigns/:id` — partial update, `409` if not in an editable status
- `DELETE /api/campaigns/:id` — `204`, only allowed for `DRAFT` campaigns (cancel a scheduled one instead — history isn't silently deleted)
- `POST /api/campaigns/:id/duplicate` — clones as a new `DRAFT` named "`<name>` (Copy)"

### Audience preview — `GET /api/campaigns/audience-preview?segmentId=&channel=`

Runs the segment's rules against live contacts and returns
`{ totalMatching, optedOutCount, noConsentCount, noAddressCount, estimatedMessages, sample }` —
`estimatedMessages = totalMatching - optedOutCount - noConsentCount - noAddressCount`.
`noAddressCount` (Phase 7) is a contact who is consented and not suppressed but is missing the
actual deliverable identifier for that channel — no email, no WhatsApp number, or (for Viber) no
captured `viberUserId` because they haven't yet messaged the Public Account. This is a pure read
and never writes `CampaignRecipient` rows — those only get created at actual send time.

### Lifecycle

- `POST /api/campaigns/:id/schedule` — body `{ scheduledAt }` (ISO datetime, must be future). `DRAFT`/`PAUSED` → `SCHEDULED`.
- `POST /api/campaigns/:id/pause` — `SCHEDULED`/`SENDING` → `PAUSED`.
- `POST /api/campaigns/:id/cancel` — `DRAFT`/`SCHEDULED`/`PAUSED` → `CANCELLED`.
- `POST /api/campaigns/:id/send` — body `{ testMode: boolean }`. Checks for a `CONNECTED`
  integration matching the campaign's channel (`EMAIL`→`GMAIL`, `WHATSAPP`→`WHATSAPP`,
  `VIBER`→`VIBER`); with none connected it returns `409` explaining why — never a fake success.
  All three channels genuinely send once connected: `testMode: true` (Email only — see below)
  sends one real email to the requesting user's own account address (no `CampaignRecipient` rows,
  not counted as campaign delivery) and returns `{ testSentTo }`. `testMode: false` resolves the
  channel-specific deliverable audience (consented, not suppressed, has the channel's real address
  — see audience preview above), sends to each with a pacing delay, writes a real
  `CampaignRecipient` + `CampaignMessage` row per attempt (`SENT` with the provider's real message
  id, or `FAILED` with the real error), sets the campaign to `SENT` (or `FAILED` if every send
  failed), and returns `{ sentCount, failedCount }`.
  - `testMode: true` returns `400` for `WHATSAPP`/`VIBER` — WhatsApp templates can only be tested
    against Meta's own pre-registered test numbers, and Viber has no concept of a test message
    separate from messaging a real subscriber.
  - A `WHATSAPP` campaign with no `whatsappTemplateName` configured returns `400` before any
    provider call is attempted — marketing messages must use a Meta-approved template.

## Integrations

All routes require auth; every connect/configure/disconnect route additionally requires
`ADMINISTRATOR`/`MARKETING_MANAGER`/`MARKETING_STAFF`.

- `GET /api/integrations` → `{ integrations: Integration[] }` — `id`, `type`
  (`GMAIL`/`WHATSAPP`/`VIBER`), `name`, `status`
  (`NOT_CONFIGURED`/`PENDING_VERIFICATION`/`CONNECTED`/`ERROR`/`DISABLED`). The encrypted config
  blob is never included in this response — the frontend has no reason to see even the ciphertext.
- `GET /api/integrations/gmail/connect` → `{ authUrl }` — an authenticated fetch (not a redirect)
  that returns a Google consent URL for the frontend to navigate the browser to. `503` if
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` aren't set in `server/.env`.
- `GET /api/integrations/gmail/callback` — Google redirects the user's browser here after
  consent (not called by the frontend). No auth header is present at this point; the signed
  `state` param from `/gmail/connect` carries who's connecting. Redirects to
  `{FRONTEND_URL}/integrations?connected=gmail` on success or `?error=...` on failure.
- `POST /api/integrations/gmail/disconnect` — `204`, sets status to `DISABLED` and clears the
  stored token.
- `POST /api/integrations/whatsapp/configure` (Phase 7) — body
  `{ phoneNumberId, accessToken, wabaId? }`. Verifies the credentials against Meta's real Graph API
  (`GET /{phone-number-id}`) before saving; `502` with Meta's own error message if they're invalid.
  On success, upserts a `WHATSAPP` integration as `CONNECTED` and returns `{ id, status, name }`.
- `POST /api/integrations/whatsapp/disconnect` — `204`, sets status to `DISABLED` and clears the
  stored token.
- `POST /api/integrations/viber/configure` (Phase 7) — body `{ authToken, senderName }`. Verifies
  the token via Viber's `get_account_info`, then registers this app's webhook
  (`POST /api/webhooks/viber`) via `set_webhook` in the same step, so subscriber events start
  flowing immediately. `502` with Viber's own error message if the token is invalid. On success,
  upserts a `VIBER` integration as `CONNECTED` and returns `{ id, status, name }`.
- `POST /api/integrations/viber/disconnect` — `204`, sets status to `DISABLED` and clears the
  stored token.

## Contact channel actions

- `GET /api/contacts/:id/viber-invite-link` (auth required) — generates a one-tap
  `viber://pa?chatURI=...&context=<signed token>` link for this specific contact to message your
  Public Account. `409` if Viber isn't connected. The link itself is shared outside this app (SMS,
  in person, etc); tapping it and messaging the Public Account is what triggers the
  `conversation_started` webhook event that attributes a real `viberUserId` to this contact — see
  ARCHITECTURE.md and COMPLIANCE.md.

## Webhooks (public, no auth)

- `POST /api/webhooks/viber` (Phase 7) — registered automatically when Viber is configured (see
  above). Every request's body is verified against the connected integration's own auth token via
  `X-Viber-Content-Signature` (HMAC-SHA256 over the raw request bytes) before anything in it is
  trusted; an invalid signature is silently ignored (still returns `200`, since Viber expects one,
  but takes no action). A verified `conversation_started`/`subscribed` event carrying a valid
  invite-link `context` sets that contact's `viberUserId`/`viberSubscribedAt`; a verified
  `unsubscribed` event clears `viberUserId`/`viberSubscribedAt` for whichever contact currently
  holds that Viber user id.

## Unsubscribe (public, no auth)

- `GET /api/unsubscribe?token=` — the link embedded in every marketing email's footer. `token` is
  a signed, tamper-resistant contact-id + channel pair (see COMPLIANCE.md); a valid token opts the
  contact out of that channel and adds them to the suppression list, then returns a small
  confirmation HTML page. An invalid/expired token returns `400` with a "link not valid" page
  rather than silently succeeding or leaking which contact a bad token was for.

## Tracking (public, no auth)

Embedded in every real campaign send (not test sends — those have no `CampaignRecipient` row to
attribute an event to). Standard email-marketing technique (every ESP does exactly this — no email
API exposes a real "recipient opened it" event), not fabricated data — see COMPLIANCE.md.

- `GET /api/track/open/:recipientId.gif` — the 1x1 tracking pixel. Marks that
  `CampaignRecipient` `OPENED` (unless it's already `CLICKED`, since a click implies an open and
  a late-firing pixel must never downgrade it back). Always returns a real GIF, even for an
  unknown/expired id, so a broken pixel never renders as a broken image in the recipient's inbox.
- `GET /api/track/click/:recipientId` — what a campaign's CTA link actually points to in a sent
  email. Marks `CLICKED` (and `OPENED`, if not already), then `302`-redirects to the campaign's
  real `ctaUrl` — looked up server-side from the campaign, **never taken from the request**, so
  this can't be turned into an open-redirect. Returns `404` for an unknown id or a campaign with
  no CTA configured.

## Dashboard & Reports

All routes require auth. Every figure is computed live from `campaign_recipients` /
`campaign_messages` rows — nothing is pre-aggregated, cached, or estimated.

- `GET /api/dashboard` → `{ totalContacts, activeCampaigns, scheduledCampaigns, campaignsSent,
  channelPerformance: { EMAIL|WHATSAPP|VIBER: { sent, opened, clicked } }, campaignVolumeByMonth:
  { "YYYY-MM": count }, recentActivity: [{ id, name, channel, status, updatedAt }] }`.
  `activeCampaigns` counts campaigns currently `SENDING` (in this synchronous-send build that's
  usually near-instant, so often 0 — that's correct, not a bug).
- `GET /api/reports/campaigns` → `{ reports: [{ campaign, metrics }] }` for every campaign that has
  reached `SENDING`/`SENT`/`FAILED` — sorted client-side for comparison (by recency, sent count,
  open rate, click rate).
- `GET /api/reports/campaigns/:id` → `{ campaign, metrics }` for one campaign.

`metrics` shape: `{ recipients, sent, failed, opened, clicked, unsubscribed, openRate, clickRate }`.

- `sent` counts every recipient the provider actually accepted for delivery — including ones that
  later moved on to `OPENED`/`CLICKED` (a click implies it was sent first). This is **not** the
  same as "delivered to the inbox", which Gmail's API doesn't confirm — see COMPLIANCE.md for why
  there's deliberately no `delivered` field here.
- `opened`/`clicked` are cumulative real counts from the tracking endpoints above.
- `unsubscribed` means "recipients of this campaign whose contact is *currently* suppressed on
  this channel" — a real, present-tense fact, not a claim that they unsubscribed *because of* this
  specific send (the unsubscribe token doesn't carry which campaign triggered the click).
- There is deliberately no `conversion` field — no goal or e-commerce integration exists yet to
  attribute a conversion to a send.

## Automation (Phase 9)

All routes require auth; write actions require `ADMINISTRATOR`, `MARKETING_MANAGER`, or
`MARKETING_STAFF` (same group as campaigns).

- `GET /api/automation-rules` → `{ rules: AutomationRule[] }`
- `GET /api/automation-rules/:id` → `{ rule }`
- `POST /api/automation-rules` — body
  `{ name, triggerType: "NEW_CONTACT"|"LEAD_STATUS_CHANGED"|"MANUAL_ONLY", triggerValue?,
  steps: [{ dayOffset, channel, templateId, whatsappTemplateName?, whatsappTemplateLanguage? }],
  isActive? }`. `triggerValue` is required (and only meaningful) for `LEAD_STATUS_CHANGED` — the
  lead status that fires this rule. Steps must have distinct `dayOffset` values; a `WHATSAPP` step
  needs `whatsappTemplateName` for the same reason a WhatsApp campaign does — see COMPLIANCE.md.
- `PUT /api/automation-rules/:id` — partial update, same body shape.
- `DELETE /api/automation-rules/:id` — `204`. Refuses (`409`) while `isActive: true` — deactivate
  first, so an active enrollment's history is never silently cascade-deleted by accident.
- `GET /api/automation-rules/:id/enrollments` → `{ enrollments: AutomationEnrollment[] }`, each
  with `status` (`ACTIVE`/`COMPLETED`/`CANCELLED`), `currentStepIndex`, `nextStepDueAt`.
- `POST /api/automation-rules/:id/enroll` — body `{ contactId }`. Manual enrollment, available
  regardless of the rule's trigger type. `409` if the rule isn't active, or if this contact is
  already enrolled in it (one enrollment per rule+contact, enforced by a unique constraint — a
  trigger firing twice, or a double-click here, can never create a duplicate).
- `POST /api/automation-rules/enrollments/:enrollmentId/cancel` — stops further steps for that
  one enrollment; `409` if it isn't currently `ACTIVE`.
- `POST /api/automation-rules/run-now` → `{ processed, sent, failed, skipped }`. Manually triggers
  the same check the in-process 5-minute scheduler runs — real sends happen here exactly like a
  scheduled tick, nothing is simulated. Intended for the UI's "Run now" button and for an external
  free-tier cron pinger to hit in a production deployment where the server may be scaled to zero
  between requests — see ARCHITECTURE.md and DEPLOYMENT.md.

Automatic enrollment (no endpoint — happens as a side effect): creating a contact evaluates every
active `NEW_CONTACT` rule; updating a contact's `leadStatus` (including via the bulk-update
endpoint) evaluates every active `LEAD_STATUS_CHANGED` rule whose `triggerValue` matches the new
status, but only on an actual transition into that status.

## Administration (Phase 10)

All routes require auth and `ADMINISTRATOR` — the only role group in this API not shared with any
other role (`config/roles.ts` `CAN_MANAGE_ADMIN`).

- `GET /api/admin/users` → `{ users: AdminUser[] }` — `id`, `email`, `firstName`, `lastName`,
  `isActive`, `lastLoginAt`, `createdAt`, `role: { id, name }`.
- `POST /api/admin/users` — body `{ email, password, firstName, lastName, roleId }`. `409` on a
  duplicate email. Password is hashed immediately, never returned or logged.
- `PUT /api/admin/users/:id` — partial update `{ firstName?, lastName?, roleId?, isActive? }`.
  `409` if this update would leave the system with zero active Administrators (demoting or
  deactivating the only one) — checked against the state *after* the proposed change, so a
  legitimate change (another active Administrator already exists) is never blocked.
- `POST /api/admin/users/:id/reset-password` — body `{ password }` (min 8 characters). `204`.
  There is no email-based reset flow; the admin communicates the new password directly.
- No `DELETE /api/admin/users/:id` — by design. `AuditLog.userId` and every content table's
  `createdBy` reference `User`; deactivation (`isActive: false`, already checked at login) is the
  only supported way to revoke an account. See ARCHITECTURE.md.
- `GET /api/admin/roles` → `{ roles: [{ id, name, description, userCount, grants: string[] }] }`.
  `grants` is computed live from the same `CAN_*` role arrays every other route's `requireRole`
  check reads — not the seeded (and unenforced) `Permission`/`RolePermission` tables. Read-only;
  there's no endpoint to edit a role's grants, because doing so wouldn't change any real
  enforcement — see ARCHITECTURE.md's "Roles" section.
- `GET /api/admin/audit-logs?action=&entityType=&userId=&from=&to=&page=&pageSize=` →
  `{ logs: AuditLogEntry[], total, page, pageSize }` (default `pageSize` 50, max 200). Every field
  is an exact filter (no fuzzy matching); `from`/`to` are ISO datetimes bounding `createdAt`.
- `GET /api/admin/sending-limits` → `{ limits: [{ type, connected, dailyLimit, defaultDailyLimit,
  sentToday }] }` for `GMAIL`/`WHATSAPP`/`VIBER`. `dailyLimit`/`sentToday` are `null` when that
  channel isn't currently `CONNECTED` — there's nothing real to report yet.
- `PUT /api/admin/sending-limits/:type` — body `{ dailyLimit: number }` (integer, min 1). `409` if
  that channel has no connected integration. Updates the same `dailyLimit` field inside the
  integration's encrypted config that `gmailSend.service.ts`/`whatsapp.service.ts`/
  `viber.service.ts` already read on every send — this doesn't add a new limit mechanism, it makes
  the existing one admin-adjustable instead of permanently fixed at the conservative default.
