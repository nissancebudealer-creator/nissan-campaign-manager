import { useRef, useState } from "react";
import { backupApi, type RestoreSummary } from "../../lib/backupApi";
import { ApiError } from "../../lib/api";

const TABLE_LABELS: Record<string, string> = {
  tags: "Tags",
  contacts: "Contacts",
  contactTags: "Contact tags",
  consents: "Consent history",
  suppressions: "Suppression list",
  segments: "Segments",
  templates: "Templates",
  campaigns: "Campaigns",
  campaignTags: "Campaign tags",
  campaignRecipients: "Campaign recipients",
  campaignMessages: "Campaign messages",
  automationRules: "Automation rules",
  automationEnrollments: "Automation enrollments",
  automationStepLogs: "Automation step logs",
};

export function BackupTab() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<RestoreSummary[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportNotice(null);
    try {
      await backupApi.downloadExport();
      setExportNotice("Downloaded.");
      setTimeout(() => setExportNotice(null), 3000);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Could not export a backup.");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportError(null);
    setSummaries(null);
    setImporting(true);
    try {
      const result = await backupApi.importBackup(file);
      setSummaries(result.summaries);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Could not import this backup.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Exports the app's core business data — contacts, consent history, segments, templates,
        campaigns, and automation rules — as a single JSON file you keep. This is separate from
        Supabase's own database backups, which remain the real safety net for full disaster
        recovery; this is a lighter-weight, portable snapshot.
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Export a backup</h3>
        <p className="mt-1 text-xs text-slate-500">
          Downloads a JSON file to your computer. Nothing is deleted or changed by exporting.
        </p>
        {exportNotice && <p className="mt-2 text-xs text-emerald-600">{exportNotice}</p>}
        {exportError && <p className="mt-2 text-xs text-red-600">{exportError}</p>}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {exporting ? "Preparing…" : "Download backup"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Restore from a backup</h3>
        <p className="mt-1 text-xs text-slate-500">
          Adds back anything from the file that's currently missing — it never overwrites or
          deletes what's already here, so it's safe to run at any time. Records that already exist
          (matched by their original id) are left untouched.
        </p>
        <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          Only use a file exported from this app by the "Download backup" button above.
        </div>
        {importError && <p className="mt-2 text-xs text-red-600">{importError}</p>}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="mt-3 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {importing ? "Restoring…" : "Choose backup file…"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileSelected}
        />

        {summaries && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-1.5">Table</th>
                  <th className="px-3 py-1.5">In file</th>
                  <th className="px-3 py-1.5">Added</th>
                  <th className="px-3 py-1.5">Already had / skipped</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.table} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-700">{TABLE_LABELS[s.table] ?? s.table}</td>
                    <td className="px-3 py-1.5 text-slate-500">{s.inTotal}</td>
                    <td className="px-3 py-1.5 text-emerald-700">{s.inserted}</td>
                    <td className="px-3 py-1.5 text-slate-500">{s.skippedOrFailed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
