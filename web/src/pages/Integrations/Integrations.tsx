import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { integrationsApi } from "../../lib/campaignsApi";
import { ApiError } from "../../lib/api";
import type { Integration } from "../../types";

const STATUS_LABELS: Record<string, string> = {
  NOT_CONFIGURED: "Not connected",
  PENDING_VERIFICATION: "Pending verification",
  CONNECTED: "Connected",
  ERROR: "Error",
  DISABLED: "Disconnected",
};

const STATUS_STYLES: Record<string, string> = {
  NOT_CONFIGURED: "bg-slate-100 text-slate-600",
  PENDING_VERIFICATION: "bg-amber-100 text-amber-700",
  CONNECTED: "bg-emerald-100 text-emerald-700",
  ERROR: "bg-red-100 text-red-700",
  DISABLED: "bg-slate-100 text-slate-600",
};

export function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  async function load() {
    setLoading(true);
    const result = await integrationsApi.list();
    setIntegrations(result.integrations);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const errorParam = searchParams.get("error");
    if (connected === "gmail") {
      setNotice("Gmail connected successfully.");
      load();
    } else if (errorParam) {
      setError(
        errorParam === "connect_failed"
          ? "Could not complete the Gmail connection. Please try again."
          : `Connection failed: ${errorParam}`,
      );
    }
    if (connected || errorParam) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gmail = integrations.find((i) => i.type === "GMAIL");
  const gmailConnected = gmail?.status === "CONNECTED";
  const [gmailSenderName, setGmailSenderName] = useState("");
  const [gmailSenderNameSaved, setGmailSenderNameSaved] = useState("");
  const [savingSenderName, setSavingSenderName] = useState(false);
  const [senderNameNotice, setSenderNameNotice] = useState<string | null>(null);
  const [senderNameError, setSenderNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!gmailConnected) return;
    integrationsApi.getGmailSenderName().then((r) => {
      setGmailSenderName(r.senderName ?? "");
      setGmailSenderNameSaved(r.senderName ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailConnected]);

  async function handleSaveSenderName(e: FormEvent) {
    e.preventDefault();
    setSavingSenderName(true);
    setSenderNameError(null);
    setSenderNameNotice(null);
    try {
      const result = await integrationsApi.updateGmailSenderName(gmailSenderName);
      setGmailSenderNameSaved(result.senderName);
      setSenderNameNotice("Saved.");
      setTimeout(() => setSenderNameNotice(null), 2000);
    } catch (err) {
      setSenderNameError(err instanceof ApiError ? err.message : "Could not save the sender name.");
    } finally {
      setSavingSenderName(false);
    }
  }

  async function handleConnectGmail() {
    setConnecting(true);
    setError(null);
    try {
      const { authUrl } = await integrationsApi.connectGmail();
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the Gmail connection.");
      setConnecting(false);
    }
  }

  async function handleDisconnectGmail() {
    await integrationsApi.disconnectGmail();
    load();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900">Integrations</h1>
      <p className="mt-1 text-sm text-slate-600">
        Connect the channels campaigns send through. Nothing here simulates a connection or a
        send — a channel only shows Connected once a real account is authorized.
      </p>

      {notice && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Gmail</h2>
            <p className="text-xs text-slate-500">Email campaigns send through the Gmail API via OAuth2.</p>
          </div>
          {!loading && gmail && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[gmail.status]}`}>
              {STATUS_LABELS[gmail.status]}
            </span>
          )}
          {!loading && !gmail && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Not connected
            </span>
          )}
        </div>

        {gmailConnected && (
          <p className="mt-2 text-sm text-slate-600">Connected as <strong>{gmail!.name}</strong></p>
        )}

        {gmailConnected && (
          <form onSubmit={handleSaveSenderName} className="mt-3">
            <label className="block text-xs font-medium text-slate-600">
              Sender name (shown to recipients instead of the raw address)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={gmailSenderName}
                onChange={(e) => setGmailSenderName(e.target.value)}
                placeholder="e.g. Nissan Cebu Dealer"
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={savingSenderName || !gmailSenderName.trim() || gmailSenderName === gmailSenderNameSaved}
                className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingSenderName ? "Saving…" : "Save"}
              </button>
            </div>
            {senderNameNotice && <p className="mt-1 text-xs text-emerald-600">{senderNameNotice}</p>}
            {senderNameError && <p className="mt-1 text-xs text-red-600">{senderNameError}</p>}
          </form>
        )}

        <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Gmail API sending limits (not something this app can raise)</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>500 messages / 24h on a standard @gmail.com account</li>
            <li>2,000 messages / 24h on a Google Workspace account</li>
            <li>Sends are paced and retried on transient errors, but a daily limit hit stops the campaign cleanly rather than retrying into a ban</li>
            <li>No password is ever stored — only an OAuth2 token, encrypted at rest, scoped to sending mail as you</li>
          </ul>
        </div>

        <div className="mt-4">
          {gmailConnected ? (
            <button
              onClick={handleDisconnectGmail}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Disconnect Gmail
            </button>
          ) : (
            <button
              onClick={handleConnectGmail}
              disabled={connecting}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {connecting ? "Redirecting to Google…" : "Connect Gmail"}
            </button>
          )}
        </div>
      </div>

      <WhatsAppCard
        integration={integrations.find((i) => i.type === "WHATSAPP")}
        loading={loading}
        onChanged={load}
      />
      <ViberCard integration={integrations.find((i) => i.type === "VIBER")} loading={loading} onChanged={load} />
    </div>
  );
}

function StatusBadge({ status, loading }: { status?: Integration["status"]; loading: boolean }) {
  if (loading) return null;
  const key = status ?? "NOT_CONFIGURED";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[key]}`}>
      {STATUS_LABELS[key]}
    </span>
  );
}

function WhatsAppCard({
  integration,
  loading,
  onChanged,
}: {
  integration?: Integration;
  loading: boolean;
  onChanged: () => void;
}) {
  const connected = integration?.status === "CONNECTED";
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await integrationsApi.configureWhatsApp({ phoneNumberId, accessToken, wabaId: wabaId || undefined });
      setPhoneNumberId("");
      setAccessToken("");
      setWabaId("");
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not connect WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    await integrationsApi.disconnectWhatsApp();
    onChanged();
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">WhatsApp Business</h2>
          <p className="text-xs text-slate-500">Meta WhatsApp Business Cloud API.</p>
        </div>
        <StatusBadge status={integration?.status} loading={loading} />
      </div>

      {connected && (
        <p className="mt-2 text-sm text-slate-600">
          Connected as <strong>{integration!.name}</strong>
        </p>
      )}

      <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Real requirements — not something this app can skip</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Needs a Meta Business App with WhatsApp added, and Meta Business Verification for production sending</li>
          <li>Marketing messages must use a template pre-approved by Meta — free-form text only works inside an existing 24h customer-service session</li>
          <li>First 1,000 conversations/month are free; billed per conversation after that at Meta's Philippines rates</li>
          <li>Starts at Tier 1 (250 messages/24h) — Meta raises this automatically as your number's quality rating and volume grow</li>
        </ul>
      </div>

      <div className="mt-4">
        {connected ? (
          <button
            onClick={handleDisconnect}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Disconnect WhatsApp
          </button>
        ) : (
          <form onSubmit={handleConnect} className="space-y-2">
            {formError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}
            <div>
              <label className="block text-xs font-medium text-slate-600">Phone Number ID</label>
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                placeholder="From Meta Business Manager"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">System User access token</label>
              <input
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                required
                type="password"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">WhatsApp Business Account ID (optional)</label>
              <input
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Verifying with Meta…" : "Connect WhatsApp"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ViberCard({
  integration,
  loading,
  onChanged,
}: {
  integration?: Integration;
  loading: boolean;
  onChanged: () => void;
}) {
  const connected = integration?.status === "CONNECTED";
  const [authToken, setAuthToken] = useState("");
  const [senderName, setSenderName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await integrationsApi.configureViber({ authToken, senderName });
      setAuthToken("");
      setSenderName("");
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not connect Viber.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    await integrationsApi.disconnectViber();
    onChanged();
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Viber</h2>
          <p className="text-xs text-slate-500">Viber Public Account API.</p>
        </div>
        <StatusBadge status={integration?.status} loading={loading} />
      </div>

      {connected && (
        <p className="mt-2 text-sm text-slate-600">
          Connected as <strong>{integration!.name}</strong>
        </p>
      )}

      <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Real requirements — not something this app can skip</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Needs a Viber Public Account (and for larger promotional volume, typically a Viber-approved BSP contract)</li>
          <li>Viber requires the contact to message your Public Account first — this app can never send to a phone number alone, only to a real subscriber. Generate a personal invite link from a contact's record on the Contacts page.</li>
          <li>Connecting here also registers our webhook with Viber so new subscribers are captured automatically</li>
        </ul>
      </div>

      <div className="mt-4">
        {connected ? (
          <button
            onClick={handleDisconnect}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Disconnect Viber
          </button>
        ) : (
          <form onSubmit={handleConnect} className="space-y-2">
            {formError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}
            <div>
              <label className="block text-xs font-medium text-slate-600">Public Account auth token</label>
              <input
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                required
                type="password"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Sender name (shown to recipients)</label>
              <input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                placeholder="e.g. Nissan Cebu"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Verifying with Viber…" : "Connect Viber"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
