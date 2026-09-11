import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { ApiError } from "../../lib/api";
import type { SendingLimitRow } from "../../types";

const CHANNEL_LABELS: Record<string, string> = { GMAIL: "Email (Gmail)", WHATSAPP: "WhatsApp", VIBER: "Viber" };

export function SendingLimitsTab() {
  const [limits, setLimits] = useState<SendingLimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await adminApi.getSendingLimits();
    setLimits(result.limits);
    setDrafts(Object.fromEntries(result.limits.map((l) => [l.type, String(l.dailyLimit ?? l.defaultDailyLimit)])));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(type: string) {
    const value = Number(drafts[type]);
    if (!Number.isInteger(value) || value < 1) {
      setNotice("Enter a whole number of at least 1.");
      return;
    }
    setSaving(type);
    setNotice(null);
    try {
      await adminApi.updateSendingLimit(type, value);
      setNotice(`${CHANNEL_LABELS[type]} limit updated to ${value}/24h.`);
      load();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not update this limit.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Each channel starts at a conservative default and enforces it server-side on every send —
        raising it here only ever changes what's allowed, never bypasses the provider's real
        rate limit. Only raise a limit once the provider has actually confirmed a higher tier for
        your account (e.g. Meta upgrading your WhatsApp number, or switching Gmail to a Google
        Workspace account) — this app has no way to detect that for you.
      </p>

      {notice && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p>}

      {loading ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="mt-3 space-y-3">
          {limits.map((limit) => (
            <div key={limit.type} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{CHANNEL_LABELS[limit.type]}</h3>
                <span
                  className={
                    limit.connected
                      ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                      : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                  }
                >
                  {limit.connected ? "Connected" : "Not connected"}
                </span>
              </div>

              {!limit.connected ? (
                <p className="mt-2 text-xs text-slate-500">
                  Connect this channel under Integrations before its limit can be adjusted. Default
                  once connected: {limit.defaultDailyLimit}/24h.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-slate-500">
                    Sent today: {limit.sentToday ?? 0} — documented default for a new connection:{" "}
                    {limit.defaultDailyLimit}/24h.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="input w-32"
                      value={drafts[limit.type] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [limit.type]: e.target.value }))}
                    />
                    <span className="text-xs text-slate-500">messages / 24h</span>
                    <button
                      onClick={() => handleSave(limit.type)}
                      disabled={saving === limit.type}
                      className="ml-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {saving === limit.type ? "Saving…" : "Save"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
