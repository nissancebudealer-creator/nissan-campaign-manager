import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { campaignsApi } from "../../lib/campaignsApi";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_STYLES, CHANNELS } from "../../lib/constants";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useAuthStore } from "../../store/authStore";
import { ApiError } from "../../lib/api";
import type { Campaign, CampaignStatus } from "../../types";

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", VIBER: "Viber" };

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CampaignStatus | "">("");
  const [channel, setChannel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isAdministrator = useAuthStore((s) => s.user?.role) === "ADMINISTRATOR";
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const result = await campaignsApi.list({ status: status || undefined, channel: channel || undefined });
    setCampaigns(result.campaigns);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, channel]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await campaignsApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete this campaign.");
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-600">
            Draft, preview, schedule, and track multi-channel campaigns.
          </p>
        </div>
        <button
          onClick={() => navigate("/campaigns/new")}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          New campaign
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <select
          className="input w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value as CampaignStatus | "")}
        >
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="input w-40" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Channel</th>
              <th className="px-4 py-2">Audience</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && campaigns.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No campaigns yet.
                </td>
              </tr>
            )}
            {!loading &&
              campaigns.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-2 text-slate-600">{c.type}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {CHANNEL_LABELS[c.channel]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{c.segment?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAMPAIGN_STATUS_STYLES[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{new Date(c.updatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate(`/campaigns/${c.id}`)}
                      className="mr-3 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      {c.status === "DRAFT" || c.status === "SCHEDULED" || c.status === "PAUSED"
                        ? "Edit"
                        : "View"}
                    </button>
                    {(c.status === "DRAFT" || isAdministrator) && (
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {deleteError && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this campaign?"
        description={
          deleteTarget
            ? deleteTarget.status === "DRAFT"
              ? `"${deleteTarget.name}" will be permanently removed.`
              : `"${deleteTarget.name}" has real send history — recipients, opens, and clicks. Deleting it erases that history permanently, not just the campaign. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
