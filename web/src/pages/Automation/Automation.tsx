import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { automationApi } from "../../lib/automationApi";
import { ApiError } from "../../lib/api";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { AUTOMATION_TRIGGER_LABELS } from "../../lib/constants";
import type { AutomationRule } from "../../types";

export function Automation() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const result = await automationApi.list();
    setRules(result.rules);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleActive(rule: AutomationRule) {
    await automationApi.update(rule.id, { isActive: !rule.isActive });
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await automationApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete this automation.");
      setDeleteTarget(null);
    }
  }

  async function handleRunNow() {
    setRunningNow(true);
    setRunResult(null);
    try {
      const result = await automationApi.runNow();
      setRunResult(
        `Checked ${result.processed} due step${result.processed === 1 ? "" : "s"} — ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed.`,
      );
    } catch (err) {
      setRunResult(err instanceof ApiError ? err.message : "Could not run the automation check.");
    } finally {
      setRunningNow(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Automation</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cadence-based follow-up sequences triggered by lead events. A background check runs
            every 5 minutes; nothing here bypasses consent, suppression, or a channel's rate limits
            — automation sends through the exact same connected integrations as campaigns.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunNow}
            disabled={runningNow}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Manually check for due steps right now, instead of waiting for the next 5-minute check"
          >
            {runningNow ? "Running…" : "Run now"}
          </button>
          <button
            onClick={() => navigate("/automation/new")}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            New automation
          </button>
        </div>
      </div>

      {runResult && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{runResult}</p>}
      {deleteError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Trigger</th>
              <th className="px-4 py-2">Steps</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No automations yet. Create one to start a cadence when a lead comes in or changes status.
                </td>
              </tr>
            )}
            {!loading &&
              rules.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{rule.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {AUTOMATION_TRIGGER_LABELS[rule.triggerType]}
                    {rule.triggerType === "LEAD_STATUS_CHANGED" && rule.triggerValue && (
                      <span className="font-medium text-slate-900"> {rule.triggerValue}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{rule.stepsJson.length}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={
                        rule.isActive
                          ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                      }
                    >
                      {rule.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate(`/automation/${rule.id}`)}
                      className="mr-3 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(rule)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this automation?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be permanently removed, along with its enrollment history.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
