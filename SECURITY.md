# Security

## Authentication & authorization

- Passwords hashed with bcrypt (12 salt rounds), never stored or logged in plaintext.
- Auth via short-lived JWTs (default 8h expiry, configurable via `JWT_EXPIRES_IN`) signed with a
  secret from `JWT_SECRET` — never hardcoded, never sent to the frontend bundle.
- All non-public API routes require a valid `Authorization: Bearer <token>` header
  (`requireAuth` middleware); role-gated routes additionally use `requireRole(...)`.
- `/api/auth/register` and `/api/auth/login` are rate-limited (20 requests / 15 min / IP) to
  slow brute-force and credential-stuffing attempts.

## Input validation

All request bodies are validated with Zod schemas at the controller boundary before touching the
database; validation failures return `400` with field-level detail, never a raw stack trace.

## Secrets

- `server/.env` (git-ignored) holds all secrets; `.env.example` documents required variables
  without real values.
- Gmail OAuth tokens (and WhatsApp/Viber credentials from Phase 7 onward) are stored in the
  `integrations.config` column **encrypted at the application layer** (AES-256-GCM, a dedicated
  `ENCRYPTION_KEY` — see `server/src/lib/crypto.ts`) before being persisted — never in plaintext,
  never in frontend code or logs. `GET /api/integrations` explicitly excludes `config` from its
  response (`select`, not just omitting it after the fact) — the encrypted blob never leaves the
  server at all, not even as ciphertext.
- **No password is ever requested or stored for Gmail.** Connecting uses OAuth2 exclusively
  (`gmailAuth.service.ts`) — the app only ever holds a scoped refresh token (`gmail.send` +
  `userinfo.email`), which the user can revoke at any time from
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions) independent of
  this app.
- The OAuth `state` parameter (which tells `/gmail/callback` who initiated the connect, since
  Google's redirect carries no auth header) is a short-lived (10 min) signed JWT, not a raw user
  id — it can't be forged or replayed after expiry.
- Unsubscribe links are signed with a dedicated `UNSUBSCRIBE_SECRET` (separate from `JWT_SECRET`
  and `ENCRYPTION_KEY` — different purpose, different blast radius if one were ever compromised),
  verified with `crypto.timingSafeEqual` to avoid timing side-channels on the signature check.

## Transport & headers

- `helmet()` sets standard security headers (CSP baseline, no-sniff, frame denial, etc).
- CORS is restricted to the configured frontend origin (`CORS_ORIGIN`), not wildcarded.

## Error handling

A single error-handling middleware (`middleware/errorHandler.ts`) ensures:
- Known/operational errors (`AppError`) return their intended status code and a safe message.
- Zod validation errors return `400` with structured field errors.
- Anything unexpected is logged server-side and returns a generic `500` — internals (stack
  traces, DB errors) are never leaked to the client.

## Audit logging

The `audit_logs` table (schema defined in Phase 1, populated starting Phase 2+) records
who did what, when, on which entity — for sensitive actions like campaign sends, contact
deletion, and role changes. Viewable, filterable, and paginated in Administration → Audit Log
(Phase 10, `ADMINISTRATOR`-only) — the same real rows every phase has been writing all along, not
a separate summarized view.

## Account management (Phase 10)

- **User management, role assignment, and password resets are `ADMINISTRATOR`-only**
  (`config/roles.ts` `CAN_MANAGE_ADMIN`) — the single most sensitive route group in the app, not
  shared with any other role.
- **A structural lockout guard**: no update can leave the system with zero active Administrators —
  demoting or deactivating the only one is refused before it happens, since there would be no one
  left able to undo it or grant access back.
- **Passwords are never emailed, logged, or persisted in plaintext** at any point — an admin
  resetting one hashes it (`bcryptjs`) exactly like registration/login already do, and communicates
  the new value to the user directly, outside the app.
- **No user-deletion endpoint, by design.** `AuditLog.userId` and every content table's
  `createdBy`-style foreign key reference `User` — deleting one would either orphan real audit
  history and content, or (for the audit log specifically, which uses `ON DELETE SET NULL`) erase
  who performed a past action. Deactivation (`isActive: false`, already checked at login) is the
  only supported way to revoke an account.

## Not yet implemented (tracked for future work)

- CSRF protection (not yet needed — the API is stateless/token-based with no cookie sessions;
  will revisit if cookie-based auth is ever introduced)
- Per-endpoint rate limiting on `/api/campaigns/:id/send` beyond the daily-count guard already
  enforced in `gmailSend.service.ts` — an authenticated user hammering the endpoint repeatedly
  isn't currently throttled at the HTTP layer, only stopped once the provider's real daily cap
  (itself admin-adjustable as of Phase 10) is hit
- Sending is currently synchronous within the HTTP request — fine for today's list sizes, but a
  background job queue is the right upgrade before very large campaigns, both for reliability and
  so a slow client connection can't cut a send loop short mid-way. (Automation's Phase 9 scheduling
  need turned out not to require one — see ARCHITECTURE.md — so this remains open for campaign
  sending specifically, not something Phase 9 already closed.)
