import { useEffect, useState, type FormEvent } from "react";
import { settingsApi } from "../../lib/settingsApi";
import { ApiError } from "../../lib/api";
import { ImageUrlField } from "../../components/ui/ImageUrlField";
import { useBrandingStore } from "../../store/brandingStore";

export function BrandingTab() {
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.getBranding().then((b) => {
      setCompanyName(b.companyName ?? "");
      setLogoUrl(b.logoUrl ?? "");
      setLoading(false);
    });
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await settingsApi.updateBranding({ companyName, logoUrl });
      useBrandingStore.getState().setBranding(result);
      setNotice("Saved — the sidebar and sign-in page update immediately.");
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save branding.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Shown across this app's own screens — the sidebar and the sign-in page. This is separate
        from what a customer sees in a campaign; see Integrations to set the sender name shown in
        outgoing emails.
      </p>

      {notice && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={handleSave} className="mt-4 max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Company name</span>
          <input
            className="input mt-1"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Nissan Cebu Dealer"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">Logo</span>
          <div className="mt-1">
            <ImageUrlField value={logoUrl} onChange={setLogoUrl} />
          </div>
          {logoUrl && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-slate-50 p-2">
              <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
              <span className="text-xs text-slate-500">Preview</span>
            </div>
          )}
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
