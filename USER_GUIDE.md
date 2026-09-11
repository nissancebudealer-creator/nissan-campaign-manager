# User Guide

A practical, example-driven walkthrough of the Campaign Manager for the people who actually use it
day to day — marketing and sales staff at the dealership, not developers. If you're looking for
technical/setup documentation instead, see [SETUP.md](./SETUP.md) or [API.md](./API.md).

Every example below uses a fictional dealership scenario so you can follow along with real numbers
and real screens, not abstract descriptions.

## Contents

1. [Signing in and roles](#1-signing-in-and-roles)
2. [The Dashboard](#2-the-dashboard)
3. [Contacts — your customer & lead database](#3-contacts--your-customer--lead-database)
4. [Segments — deciding who to target](#4-segments--deciding-who-to-target)
5. [Templates — reusable message content](#5-templates--reusable-message-content)
6. [Campaigns — putting it all together](#6-campaigns--putting-it-all-together)
7. [Integrations — connecting Email, WhatsApp, Viber](#7-integrations--connecting-email-whatsapp-viber)
8. [Reports & Dashboard analytics](#8-reports--dashboard-analytics)
9. [Automation — cadences that run themselves](#9-automation--cadences-that-run-themselves)
10. [Administration (Administrators only)](#10-administration-administrators-only)
11. [Compliance basics every sender should know](#11-compliance-basics-every-sender-should-know)
12. [Troubleshooting & FAQ](#12-troubleshooting--faq)

---

## 1. Signing in and roles

Go to the app's login page and sign in with the email and password your Administrator gave you.
If you're the very first person ever to sign up on a brand-new installation, that account
automatically becomes an **Administrator** — everyone who registers after that starts as a
**Viewer** until an Administrator upgrades their role (Administration → Users).

| Role | What they can do |
|---|---|
| **Administrator** | Everything, including Administration (users, roles, audit log, sending limits) |
| **Marketing Manager** | Full marketing toolkit: contacts, segments, templates, campaigns, automation — create *and* delete |
| **Marketing Staff** | Same toolkit, but can't delete segments/templates/campaigns |
| **Sales Manager** / **Sales Staff** | Can view and update contacts/leads; can't build or send campaigns |
| **Viewer** | Read-only — dashboards and reports |

Don't see a button or page you expect? It's almost certainly your role — ask an Administrator.

## 2. The Dashboard

The Dashboard (the page you land on after signing in) is your at-a-glance summary:

- **Total Contacts**, **Active Campaigns**, **Scheduled Campaigns**, **Campaigns Sent** — real
  counts, refreshed every time you load the page.
- **Campaign volume** — a bar chart of how many campaigns you've sent per month.
- **Channel performance** — sent/opened/clicked totals broken out by Email, WhatsApp, and Viber.
- **Recent campaign activity** — your last few campaigns with a direct link to each one.

> Every number on this page traces back to a real event (a real email sent, a real click). If a
> channel shows "No campaigns sent yet," that's exactly true — nothing is estimated to fill the
> gap.

## 3. Contacts — your customer & lead database

**Contacts** is where every customer, prospect, and lead lives. Click **Contacts** in the sidebar.

### Adding one contact

Click **Add contact**, fill in name/email/phone, and — importantly — set their **Consent**
before saving. A contact with no recorded consent for a channel can never receive a campaign on
that channel, so this step matters, not just a formality.

**Example**: Maria walks into the showroom and asks to be added to your mailing list.

1. Add contact → First name `Maria`, Last name `Santos`, Email `maria.santos@example.com`.
2. Set **Lead Status** to `Hot` (she's actively shopping) and **Product Interest** to `SUV`.
3. Scroll to **Consent changes** → set **Email** to `Opt in`, **Consent source** to `In-store`.
4. Save. Maria can now legally receive email campaigns; her WhatsApp/Viber stay "No record" until
   she opts in on those too.

### Importing many contacts at once

Click **Import CSV**, upload a spreadsheet, and map its columns to the app's fields (name, email,
lead status, etc.). The app shows you a **preview** first — which rows are valid, which have
duplicate emails, which are missing required fields — before you commit anything. Only valid rows
get created; nothing is silently skipped without telling you.

### Tags and bulk actions

Select multiple contacts with the checkboxes, then use the bulk action bar to add a tag or change
lead status for all of them at once — handy after a trade show when you've got 40 new leads to mark
`Hot` and tag `Trade Show 2026` in one go.

## 4. Segments — deciding who to target

A **Segment** is a saved rule that answers "who exactly should get this campaign?" Every campaign
targets exactly one segment — there's no "send to everyone" button, on purpose, so every send is a
deliberate choice.

**Example**: You want to follow up with hot SUV leads.

1. Segments → **New segment**. Name it `Hot SUV Leads`.
2. Add a condition: **Lead Status** `is` `Hot`.
3. Click **+ Add condition (AND)**: **Product Interest** `contains` `SUV`.
4. The **live preview** on the right updates as you type, showing exactly which real contacts
   match right now — Maria from the example above would show up here.
5. Save.

Need an "or" instead of "and"? Click **+ Add group (OR)** to add a second, independent group of
conditions — a contact matches the segment if they satisfy *any* group, and *all* conditions
*within* a group.

## 5. Templates — reusable message content

A **Template** is content you can reuse across campaigns — a "New Vehicle Promotion" email you'll
send every quarter, for instance. Templates → **New template**.

**Example**: A monthly service reminder email.

1. Name: `Monthly Service Reminder`. Category: `Service Promotion`. Channel: `Email`.
2. Subject: `Time for {{first_name}}'s next service, {{last_name}}!`
3. Message: `Hi {{first_name}}, it's been a while since your last visit. Book a service appointment this week and get 10% off.`
4. The **personalization buttons** (+ First name, + Last name, etc.) insert `{{tokens}}` at your
   cursor — these get replaced with each real contact's actual data when a campaign sends. The
   **live preview** shows what it'll look like with sample data.
5. Save.

Templates are just starting points — a campaign built from one can still be edited freely before
sending.

## 6. Campaigns — putting it all together

This is the core workflow: Contacts + Segment + Template (or written from scratch) = a Campaign.

**Example, start to finish**: Emailing the Hot SUV Leads segment about a new model.

1. Campaigns → **New campaign**. Name it `March SUV Launch`.
2. **Target audience**: select `Hot SUV Leads`.
3. **Start from a template**: pick one, or write the subject/message from scratch.
4. **Channel**: `Email` is selected by default. (WhatsApp needs an approved Meta template name;
   Viber requires contacts who've already subscribed on Viber — see section 7.)
5. Check the **Audience panel** on the right — it shows real numbers: *N contacts match*, minus
   anyone opted out or missing a recorded opt-in, giving you the real **estimated messages** count
   *before* you send anything.
6. **Test send** first — this sends one real copy to your own account's email so you can check it
   in an actual inbox before anyone else sees it.
7. Happy with it? Click **Send now** (or **Schedule** for a future date/time). A confirmation
   dialog shows exactly who and how many, one last time, before anything goes out.
8. Once sent, the campaign becomes read-only — its history is permanent. Need to send something
   similar later? Use **Duplicate** to start a fresh draft from it.

### What "Cancel," "Pause," and "Delete" actually do

- **Delete** only works on a `DRAFT` you haven't scheduled or sent yet.
- **Schedule** → **Pause** → **Reschedule** lets you hold off a scheduled send without losing it.
- **Cancel** stops a scheduled/paused/draft campaign for good (it stays visible for the record,
  just marked `CANCELLED` — nothing with real history is ever silently erased).

## 7. Integrations — connecting Email, WhatsApp, Viber

Before any campaign can actually send, its channel needs to be connected under **Integrations**.
Nothing here ever fakes a connection — a channel shows "Connected" only once a real account is
authorized, and every real requirement/cost is shown right on the page before you commit to it.

- **Gmail**: click **Connect Gmail**, sign in with your dealership's Google account in the popup.
  Free, up to Gmail's own daily sending limits (500/day standard account, 2,000/day Google
  Workspace).
- **WhatsApp**: needs a Meta Business App and Business Verification (real requirements, not
  something this app can skip) — paste in your Phone Number ID and access token once you have
  them. Marketing messages must use a template Meta has pre-approved.
- **Viber**: needs a Viber Public Account — paste in your auth token. Viber will only let you
  message a contact who has messaged your account first; use the **"Viber link"** button on a
  contact's row in Contacts to generate a personal invite link you can text or hand them.

## 8. Reports & Dashboard analytics

**Reports** lists every campaign you've sent, side by side, sortable by recency, sent count, open
rate, or click rate. Click into any one for its full detail. Every figure — sent, opened, clicked,
currently-unsubscribed — comes from a real provider response or a real click/open event; you'll
never see a "Delivered" or "Conversion" number here, because neither channel actually confirms
those, and this app doesn't invent numbers it can't back up.

## 9. Automation — cadences that run themselves

**Automation** sets up a sequence that runs on its own once a trigger fires — no one has to
remember to send a manual follow-up three days after a new lead comes in.

**Example**: A 2-touch welcome sequence for every new lead.

1. Automation → **New automation**. Name: `New Lead Welcome`.
2. **Trigger**: `New contact created`.
3. **Steps**:
   - Step 1: `0` days after enrollment, Email, template `Welcome Email`.
   - Step 2: `3` days after enrollment, Email, template `Still Interested? Follow-Up`.
4. Check **Active**, then **Save**.

From now on, every new contact created gets automatically enrolled and receives Step 1 right away
and Step 2 three days later — as long as they still have a recorded opt-in when each step comes
due. If someone unsubscribes in between, their remaining steps are honestly skipped, never sent
anyway.

You can also enroll someone manually any time from their row on the **Contacts** page — pick the
automation from the **Enroll…** dropdown. Useful for a one-off case that doesn't match any
automatic trigger.

A background check runs every 5 minutes looking for anything due; the **Run now** button on the
Automation page triggers that same check immediately if you don't want to wait.

## 10. Administration (Administrators only)

Only Administrators see everything under **Settings**.

- **Users**: add staff accounts, assign roles, deactivate someone who's left, or reset a forgotten
  password (you tell them the new password directly — it's never emailed).
- **Roles**: a read-only view of what each role can actually do — accurate always, because it's
  read live from the same rules the app itself enforces, not a separate list that could go stale.
- **Audit Log**: a searchable history of every meaningful action anyone's taken — who sent what
  campaign, who changed whose role, when.
- **Sending Limits**: raise a connected channel's daily send cap once its provider has actually
  confirmed a higher tier for your account (e.g. Meta upgrading your WhatsApp number). Never raise
  this speculatively — it changes what this app will *attempt*, not what the provider will
  actually *allow*.

## 11. Compliance basics every sender should know

- **Never send to someone with no recorded opt-in.** The app enforces this automatically — a
  contact you haven't captured consent for simply won't be counted as reachable — but it's worth
  understanding *why*: every send should be to someone who said yes.
- **Every email carries a working unsubscribe link.** Clicking it is instant and automatic — it
  updates that contact's consent and suppresses them from future sends on that channel.
- **Deleting a contact is permanent** (for real records-erasure requests) — use it deliberately,
  not as a way to "clean up" a list; opting them out is usually what you actually want instead.

## 12. Troubleshooting & FAQ

**"My campaign says 0 estimated messages."** Every matching contact is either suppressed, missing
a recorded opt-in for that channel, or missing a deliverable address (e.g. no email on file, or —
for Viber — not yet subscribed). Check the Audience panel's breakdown for the exact reason.

**"Send now is greyed out."** The channel isn't connected yet — check Integrations.

**"I can't find the Automation/Settings page."** Automation needs a Marketing role or above;
Settings (Administration) is Administrator-only. Ask an Administrator to check your role under
Administration → Users.

**"A WhatsApp/Viber campaign shows 0 opens/clicks even though I know people engaged."** Expected,
not a bug — WhatsApp template messages and Viber don't expose the same open/click signals Email
does via a tracking pixel, so this app reports what it can actually confirm rather than guessing.

**"I reset someone's password but they still can't log in."** Confirm their account is `Active`
under Administration → Users — a deactivated account can't sign in regardless of password.

---

Questions this guide doesn't answer? Check [COMPLIANCE.md](./COMPLIANCE.md) for consent/opt-out
rules in more depth, or [ARCHITECTURE.md](./ARCHITECTURE.md) if you want the technical "why" behind
how a feature works.
