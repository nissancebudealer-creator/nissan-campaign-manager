# Compliance

This platform is built for the Philippines and is designed with the **Data Privacy Act of 2012
(RA 10173)** and general anti-spam expectations for commercial messaging in mind. This document
is engineering guidance, not legal advice — have your organization's compliance/legal function
review actual usage before large sends.

## Design principles baked into the data model

1. **Consent is per-contact, per-channel, and dated.** The `consents` table records
   `optIn`/`optOut` independently for `EMAIL`, `WHATSAPP`, and `VIBER`, with `consentDate` and
   `consentSource` (e.g. "Web form", "In-store", "CSV import") — so you can show, for any contact
   and channel, exactly when and how consent was captured.

2. **Deliverability requires an explicit recorded opt-in — suppression is just the other half.**
   Every campaign audience query (`server/src/services/campaign.service.ts`
   `deliverableWhere`) requires both `consents: { some: { channel, optIn: true } }` **and**
   `suppressions: { none: { channel } }`. A contact who was imported without ever going through a
   consent-capture step (no consent record at all — "no record" state) is excluded from sending
   exactly the same as one who explicitly opted out. This was a real gap during Phase 6 build-out
   — the first implementation only checked for absence of suppression, which would have let a
   never-consented contact receive campaigns — caught during in-browser verification and fixed
   before shipping, with a dedicated test (`campaigns.integration.test.ts`, "excludes contacts
   with no recorded opt-in at all") to keep it from regressing.

3. **Every consent/opt-out change is auditable.** Consent history is append-only in the
   `consents` table (an opt-out creates a new record / sets `optOutDate` rather than deleting
   history), and `audit_logs` captures the acting user for administrative changes.

4. **No fabricated metrics.** Dashboards and reports (Phase 8) only ever display numbers backed by
   a real event: either a channel provider's own API response (e.g. Gmail confirming a send
   succeeded or failed), or a real inbound HTTP request the recipient's own client made (the open
   pixel firing, the click-redirect being followed — see below). If a metric can't be backed by
   one of those two things for a given channel, it is omitted from the UI rather than estimated,
   defaulted, or invented — see "Delivered" and "Conversion" below.

## What this means for each channel

- **Email**: live as of Phase 6. Every campaign/test email renders with a working, signed
  one-click unsubscribe link in the footer (no login required) — clicking it writes an opt-out
  consent record and adds the contact to the email suppression list automatically, verified
  end-to-end against a real Gmail send.
  - **Open/click tracking (Phase 8)**: a real send embeds a 1x1 tracking pixel and rewrites the
    CTA link through a click-redirect (both public, no-auth routes — see ARCHITECTURE.md). Both
    only ever record an event in response to a real HTTP request from the recipient's mail client.
  - **"Delivered" is deliberately never shown.** Gmail's send API confirms the message was
    *accepted for sending*, not that it reached the recipient's inbox (vs. spam folder, vs.
    bounced) — there is no API call that would let us honestly claim "delivered", so the Reports
    UI reports "Sent" instead and says so explicitly, rather than quietly relabeling one for the
    other.
  - **"Conversion" is deliberately never shown.** No goal or e-commerce integration exists to
    attribute a conversion (e.g. a test drive booked, a vehicle purchased) to a specific campaign
    send — inventing a conversion number with no underlying event to justify it would violate
    principle 4 above.
- **WhatsApp**: live as of Phase 7, gated on your own Meta Business verification. Meta requires
  opt-in before you can message a customer outside their own 24-hour service window, and marketing
  templates must be pre-approved by Meta — this app enforces the template requirement in code
  (`campaign.service.ts` refuses to send a WhatsApp campaign with no `whatsappTemplateName`
  configured, `400`, before ever attempting a provider call) rather than just documenting it.
  Recorded consent is required exactly like Email (principle 2), and a consented contact with no
  WhatsApp number on file is still excluded from the send (`noAddressCount` — see ARCHITECTURE.md).
- **Viber**: live as of Phase 7, with a stricter real constraint than a documented policy — Viber's
  own platform will not let a Public Account message a user who hasn't messaged it first. This app
  makes that structurally impossible to bypass rather than just honoring it: `Contact.viberUserId`
  (the only field a Viber send is ever addressed to) is populated exclusively by a signed webhook
  event after a real subscription (see ARCHITECTURE.md's invite-link mechanism), never entered
  manually and never derived from a phone number. A consented contact who hasn't yet subscribed
  shows up as `noAddressCount`, the same as a missing WhatsApp number — the platform has no way to
  message them yet, honestly reflected rather than hidden. Unsubscribing (a real Viber webhook
  event) clears `viberUserId` immediately, so a revoked opt-in can never still receive a send.

## Automation (Phase 9)

Automation is not a separate, looser sending path — it reuses every rule above.

- **Consent is checked twice**: once implicitly at enrollment (a `NEW_CONTACT`/`LEAD_STATUS_CHANGED`
  trigger doesn't check consent itself — enrollment isn't a send), and then for real immediately
  before each individual step actually sends, using the identical `deliverableWhere` +
  `channelAddressWhere` checks a campaign send uses. A contact who was compliant when enrolled but
  has since unsubscribed, been suppressed, or lost their deliverable address (e.g. their Viber
  subscription was revoked) has that step honestly logged `SKIPPED` — never sent, and never left
  ambiguous in the enrollment's history.
- **A step failure is never silently retried into a rate-limit violation.** If a real provider call
  fails (e.g. Gmail's daily limit), the step is logged `FAILED` and retried after a cooldown — the
  same daily-limit counters campaigns use are shared, so automation can't send more per day than a
  single connected integration actually allows.

## What the platform will never do

- Send to a contact without a recorded opt-in for that specific channel — including a step in an
  automation sequence, re-checked at send time, not just at enrollment.
- Send to a contact on the suppression list for that channel, even if re-added to a segment.
- Bypass a channel provider's rate limits, template-approval requirements, or business
  verification requirements.
- Fabricate delivery, open, click, or engagement numbers that a provider didn't actually report.

## Accountability (Phase 10)

RA 10173 expects a personal-information controller to be able to show who did what to whose data.
Administration → Audit Log (`ADMINISTRATOR`-only) makes the `audit_logs` table — already populated
by every write action since Phase 2 — actually reviewable: filterable by action, entity type,
user, and date range, so "who accessed or changed this contact's data, and when" has a real
answer, not just a table nobody could read. Role assignment (also Phase 10) is what determines who
had `contacts:write`/`contacts:delete`-equivalent access at any point in time, cross-referenceable
against that same log.

## Data subject rights (RA 10173)

The Contacts module (Phase 2) supports exporting a single contact's full record (CSV export,
filterable to one contact) and fully deleting a contact (right to access / right to erasure), and
the audit log gives a record of who accessed or changed a contact's data and when.
