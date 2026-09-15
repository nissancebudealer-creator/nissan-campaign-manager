const SECTIONS = [
  { id: "signing-in", label: "Signing in & roles" },
  { id: "dashboard", label: "Dashboard" },
  { id: "contacts", label: "Contacts" },
  { id: "segments", label: "Segments" },
  { id: "templates", label: "Templates" },
  { id: "campaigns", label: "Campaigns" },
  { id: "integrations", label: "Integrations" },
  { id: "reports", label: "Reports" },
  { id: "automation", label: "Automation" },
  { id: "admin", label: "Administration" },
  { id: "compliance", label: "Compliance basics" },
  { id: "faq", label: "Troubleshooting" },
];

function SectionHeading({ id, n, children }: { id: string; n: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-lg font-semibold text-slate-900">
      <span className="mr-2 font-mono text-sm font-medium text-slate-400">{n}</span>
      {children}
    </h2>
  );
}

function Example({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="space-y-2 text-sm text-slate-700 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-white [&_code]:border [&_code]:border-slate-200 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-slate-700">
        {children}
      </div>
    </div>
  );
}

function Note({ tone = "good", children }: { tone?: "good" | "warn"; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "good"
          ? "mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
      }
    >
      {children}
    </p>
  );
}

export function Help() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-900">Help &amp; User Guide</h1>
      <p className="mt-1 text-sm text-slate-600">
        A practical, example-led walkthrough of this app — written for the people sending
        campaigns, not developers.
      </p>

      <nav className="mt-4 flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-3">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-10">
        <section>
          <SectionHeading id="signing-in" n="01">
            Signing in and roles
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            Sign in with the email and password your Administrator gave you. If you're the very
            first person to register on a brand-new installation, that account automatically
            becomes an <strong>Administrator</strong>; everyone after that starts as a{" "}
            <strong>Viewer</strong> until an Administrator upgrades their role under Settings →
            Users.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">What they can do</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Administrator", "Everything, including Settings — users, roles, audit log, sending limits"],
                  ["Marketing Manager", "Full toolkit: contacts, segments, templates, campaigns, automation — create and delete"],
                  ["Marketing Staff", "Same toolkit, but can't delete segments, templates, or campaigns"],
                  ["Sales Manager / Staff", "View and update contacts/leads; can't build or send campaigns"],
                  ["Viewer", "Read-only — dashboards and reports"],
                ].map(([role, desc]) => (
                  <tr key={role} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{role}</td>
                    <td className="px-4 py-2 text-slate-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            Don't see a button or page you expect? It's almost certainly your role — ask an
            Administrator to check under Settings → Users.
          </Note>
        </section>

        <section>
          <SectionHeading id="dashboard" n="02">
            The Dashboard
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            The page you land on after signing in is your at-a-glance summary: Total Contacts,
            Active/Scheduled/Sent campaign counts, a monthly campaign-volume chart, per-channel
            performance (sent/opened/clicked), and your most recent campaign activity.
          </p>
          <Note>
            Every number here traces back to a real event — a real email sent, a real click. A
            channel reading "No campaigns sent yet" means exactly that; nothing is estimated to
            fill the gap.
          </Note>
        </section>

        <section>
          <SectionHeading id="contacts" n="03">
            Contacts — your customer &amp; lead database
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            Every customer, prospect, and lead lives here. This is also where <strong>consent</strong>{" "}
            is recorded — the single most important field, since a contact with no recorded
            consent for a channel can never receive a campaign on it.
          </p>
          <Example label="Example — Maria walks into the showroom">
            <p>She asks to be added to your mailing list.</p>
            <ol>
              <li>
                Add contact → First name <code>Maria</code>, Last name <code>Santos</code>, Email{" "}
                <code>maria.santos@example.com</code>.
              </li>
              <li>
                Set <strong>Lead Status</strong> to <code>Hot</code> and <strong>Product Interest</strong> to{" "}
                <code>SUV</code>.
              </li>
              <li>
                Scroll to <strong>Consent changes</strong> → set Email to <code>Opt in</code>, Consent source to{" "}
                <code>In-store</code>.
              </li>
              <li>
                Save. Maria can now legally receive email campaigns — her WhatsApp and Viber stay
                "No record" until she opts in on those too.
              </li>
            </ol>
          </Example>
          <p className="mt-3 text-sm text-slate-600">
            <strong>Importing many at once</strong>: click <strong>Import CSV</strong>, upload a
            spreadsheet, map its columns to the app's fields, and review the preview — which rows
            are valid, which have duplicate emails, which are missing required fields — before
            anything is committed.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            <strong>Tags &amp; bulk actions</strong>: select multiple contacts with the checkboxes,
            then use the bulk action bar to tag or change lead status for all of them at once —
            handy after a trade show when forty new leads need marking <code>Hot</code> in one
            pass.
          </p>
        </section>

        <section>
          <SectionHeading id="segments" n="04">
            Segments — deciding who to target
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            A Segment is a saved rule that answers "who exactly should get this campaign?" Every
            campaign targets exactly one segment — there's no "send to everyone" button, on
            purpose, so every send is a deliberate choice.
          </p>
          <Example label="Example — hot SUV leads">
            <ol>
              <li>
                Segments → <strong>New segment</strong>. Name it <code>Hot SUV Leads</code>.
              </li>
              <li>
                Add a condition: <strong>Lead Status</strong> <code>is</code> <code>Hot</code>.
              </li>
              <li>
                Click <strong>+ Add condition (AND)</strong>: <strong>Product Interest</strong> <code>contains</code>{" "}
                <code>SUV</code>.
              </li>
              <li>The live preview on the right updates as you type — Maria, from above, would show up here.</li>
              <li>Save.</li>
            </ol>
          </Example>
          <p className="mt-3 text-sm text-slate-600">
            Need an "or" instead of "and"? Click <strong>+ Add group (OR)</strong> — a contact
            matches if they satisfy <em>any</em> group, and <em>all</em> conditions{" "}
            <em>within</em> a group.
          </p>
        </section>

        <section>
          <SectionHeading id="templates" n="05">
            Templates — reusable message content
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            A Template is content you can reuse across campaigns — a "New Vehicle Promotion" email
            you'll send every quarter, for instance.
          </p>
          <Example label="Example — monthly service reminder">
            <ol>
              <li>
                Name: <code>Monthly Service Reminder</code>. Category: <code>Service Promotion</code>. Channel:{" "}
                <code>Email</code>.
              </li>
              <li>
                Subject: <code>{"Time for {{first_name}}'s next service, {{last_name}}!"}</code>
              </li>
              <li>
                Message:{" "}
                <code>
                  {"Hi {{first_name}}, it's been a while since your last visit. Book a service appointment this week and get 10% off."}
                </code>
              </li>
              <li>
                The personalization buttons insert <code>{"{{tokens}}"}</code> at your cursor — these
                become each real contact's actual data when a campaign sends.
              </li>
              <li>Save.</li>
            </ol>
          </Example>
          <p className="mt-3 text-sm text-slate-600">
            Templates are just starting points — a campaign built from one can still be edited
            freely before sending.
          </p>
        </section>

        <section>
          <SectionHeading id="campaigns" n="06">
            Campaigns — putting it all together
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            This is the core workflow: Contacts + Segment + Template (or written from scratch) = a
            Campaign.
          </p>
          <Example label="Example, start to finish — emailing Hot SUV Leads about a new model">
            <ol>
              <li>
                Campaigns → <strong>New campaign</strong>. Name it <code>March SUV Launch</code>.
              </li>
              <li>
                <strong>Target audience</strong>: select <code>Hot SUV Leads</code>.
              </li>
              <li>
                <strong>Start from a template</strong>, or write the subject/message from scratch.
              </li>
              <li>
                <strong>Channel</strong>: Email by default. WhatsApp needs an approved Meta
                template name; Viber requires contacts who've already subscribed — see
                Integrations.
              </li>
              <li>
                Check the <strong>Audience panel</strong>: real numbers — matching contacts, minus
                anyone opted out or missing a recorded opt-in — the real estimated-messages count
                before you send anything.
              </li>
              <li>
                <strong>Test send</strong> first — one real copy to your own account's email so
                you can check it in an actual inbox.
              </li>
              <li>
                <strong>Send now</strong> (or <strong>Schedule</strong>). A confirmation dialog
                shows exactly who and how many, one last time.
              </li>
              <li>
                Once sent, the campaign becomes read-only — its history is permanent. Use{" "}
                <strong>Duplicate</strong> to start a fresh draft from it later.
              </li>
            </ol>
          </Example>
          <p className="mt-3 text-sm font-medium text-slate-900">What Cancel, Pause, and Delete actually do</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li><strong>Delete</strong> only works on a draft you haven't scheduled or sent.</li>
            <li><strong>Schedule → Pause → Reschedule</strong> holds off a scheduled send without losing it.</li>
            <li>
              <strong>Cancel</strong> stops a scheduled/paused/draft campaign for good — it stays
              visible for the record, marked <code>CANCELLED</code>. Nothing with real history is
              silently erased.
            </li>
          </ul>
        </section>

        <section>
          <SectionHeading id="integrations" n="07">
            Integrations — connecting Email, WhatsApp, Viber
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            Before any campaign can send, its channel needs to be connected under{" "}
            <strong>Integrations</strong>. Nothing here fakes a connection — a channel shows
            "Connected" only once a real account is authorized.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Gmail", "Click Connect Gmail, sign in with the dealership's Google account. Free, within Gmail's own daily limits (500/day standard, 2,000/day Workspace)."],
              ["WhatsApp", "Needs a Meta Business App and Business Verification. Paste in your Phone Number ID and access token. Marketing messages need a Meta-approved template."],
              ["Viber", "Needs a Viber Public Account. Viber only allows messaging contacts who messaged you first — use the \"Viber link\" button on a contact's row to invite them."],
            ].map(([name, desc]) => (
              <div key={name} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{name}</p>
                <p className="mt-1 text-xs text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading id="reports" n="08">
            Reports &amp; Dashboard analytics
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            Reports lists every campaign you've sent, side by side, sortable by recency, sent
            count, open rate, or click rate. Every figure — sent, opened, clicked,
            currently-unsubscribed — comes from a real provider response or a real click/open
            event.
          </p>
          <Note tone="warn">
            You'll never see a "Delivered" or "Conversion" number here — neither channel actually
            confirms those, so this app doesn't invent numbers it can't back up.
          </Note>
        </section>

        <section>
          <SectionHeading id="automation" n="09">
            Automation — cadences that run themselves
          </SectionHeading>
          <p className="mt-2 text-sm text-slate-600">
            Automation sets up a sequence that runs on its own once a trigger fires — no one has
            to remember to send a manual follow-up three days after a new lead comes in.
          </p>
          <Example label="Example — a 2-touch welcome sequence">
            <ol>
              <li>
                Automation → <strong>New automation</strong>. Name: <code>New Lead Welcome</code>.
              </li>
              <li>
                <strong>Trigger</strong>: <code>New contact created</code>.
              </li>
              <li>
                Step 1 — <code>0</code> days after enrollment, Email, template <code>Welcome Email</code>.
              </li>
              <li>
                Step 2 — <code>3</code> days after enrollment, Email, template{" "}
                <code>Still Interested? Follow-Up</code>.
              </li>
              <li>
                Check <strong>Active</strong>, then Save.
              </li>
            </ol>
          </Example>
          <p className="mt-3 text-sm text-slate-600">
            Every new contact is now enrolled automatically and gets Step 1 right away, Step 2
            three days later — as long as they still have a recorded opt-in when each step comes
            due. Someone who unsubscribes in between has their remaining steps honestly skipped,
            never sent anyway.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Enroll someone manually any time from their row on Contacts — pick the automation from
            the <strong>Enroll…</strong> dropdown. A background check runs every 5 minutes; the{" "}
            <strong>Run now</strong> button triggers it immediately.
          </p>
        </section>

        <section>
          <SectionHeading id="admin" n="10">
            Administration (Administrators only)
          </SectionHeading>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>
              <strong>Users</strong> — add staff accounts, assign roles, deactivate someone who's
              left, or reset a forgotten password (told to them directly — never emailed).
            </li>
            <li>
              <strong>Roles</strong> — a read-only view of what each role can actually do, read
              live from the same rules the app enforces.
            </li>
            <li>
              <strong>Audit Log</strong> — a searchable history of every meaningful action anyone's
              taken.
            </li>
            <li>
              <strong>Sending Limits</strong> — raise a connected channel's daily cap once its
              provider has actually confirmed a higher tier. Never raise this speculatively.
            </li>
          </ul>
        </section>

        <section>
          <SectionHeading id="compliance" n="11">
            Compliance basics every sender should know
          </SectionHeading>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>
              <strong>Every contact is opted in by default when added or imported.</strong> The app
              no longer requires a separate consent-capture step first — adding or importing a
              contact is treated as your assertion that you have a real basis to message them.
              Deliverability is still gated on a real, dated consent record (never silently
              bypassed), so an explicit opt-out always removes reachability immediately; only the
              starting default changed. Only add or import contacts you actually have a legitimate
              reason to contact.
            </li>
            <li>
              <strong>Every email carries a working unsubscribe link.</strong> Clicking it
              instantly updates that contact's consent and suppresses future sends on that
              channel.
            </li>
            <li>
              <strong>Deleting a contact is permanent</strong> — reserve it for genuine erasure
              requests. Opting them out is usually what you actually want instead.
            </li>
          </ul>
        </section>

        <section>
          <SectionHeading id="faq" n="12">
            Troubleshooting &amp; FAQ
          </SectionHeading>
          <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {[
              [
                "My campaign says 0 estimated messages.",
                "Every matching contact is either suppressed, missing a recorded opt-in for that channel, or missing a deliverable address (no email on file, or — for Viber — not yet subscribed). Check the Audience panel's breakdown for the exact reason.",
              ],
              ["Send now is greyed out.", "The channel isn't connected yet — check Integrations."],
              [
                "I can't find the Automation or Settings page.",
                "Automation needs a Marketing role or above; Settings is Administrator-only. Ask an Administrator to check your role under Settings → Users.",
              ],
              [
                "A WhatsApp/Viber campaign shows 0 opens/clicks even though people engaged.",
                "Expected, not a bug — WhatsApp template messages and Viber don't expose the same open/click signals Email does via a tracking pixel, so the app reports what it can actually confirm rather than guessing.",
              ],
              [
                "I reset someone's password but they still can't log in.",
                "Confirm their account is Active under Settings → Users — a deactivated account can't sign in regardless of password.",
              ],
            ].map(([q, a]) => (
              <details key={q} className="group p-4 open:bg-slate-50">
                <summary className="cursor-pointer text-sm font-medium text-slate-900 marker:content-none">
                  {q}
                </summary>
                <p className="mt-2 text-sm text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
