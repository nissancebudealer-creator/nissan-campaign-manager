import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuthStore } from "../store/authStore";
import { analyticsApi } from "../lib/analyticsApi";
import { CAMPAIGN_STATUS_STYLES } from "../lib/constants";
import type { DashboardSummary } from "../types";

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", VIBER: "Viber" };

function formatPercent(n: number) {
  return `${Math.round(n * 100)}%`;
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    analyticsApi.dashboard().then(setSummary).catch(() => setSummary(null));
  }, []);

  const statCards = [
    { label: "Total Contacts", value: summary?.totalContacts },
    { label: "Active Campaigns", value: summary?.activeCampaigns },
    { label: "Scheduled Campaigns", value: summary?.scheduledCampaigns },
    { label: "Campaigns Sent", value: summary?.campaignsSent },
  ];

  const volumeData = summary
    ? Object.entries(summary.campaignVolumeByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month: formatMonth(month), count }))
    : [];

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        Welcome{user ? `, ${user.firstName}` : ""}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Every number below comes from a real record — no metric is estimated or fabricated. See{" "}
        <button onClick={() => navigate("/reports")} className="underline hover:text-slate-900">
          Reports
        </button>{" "}
        for per-campaign detail.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Campaign volume</p>
          <p className="mt-1 text-xs text-slate-500">Campaigns sent per month</p>
          <div className="mt-3 h-48">
            {volumeData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-slate-400">
                No campaigns sent yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="count" name="Campaigns" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Channel performance</p>
          <p className="mt-1 text-xs text-slate-500">
            Open/click rates are only shown for channels with a real, sent campaign — see
            COMPLIANCE.md.
          </p>
          <div className="mt-3 space-y-3">
            {summary &&
              (["EMAIL", "WHATSAPP", "VIBER"] as const).map((channel) => {
                const perf = summary.channelPerformance[channel];
                const openRate = perf.sent > 0 ? perf.opened / perf.sent : null;
                const clickRate = perf.sent > 0 ? perf.clicked / perf.sent : null;
                return (
                  <div key={channel} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-700">{CHANNEL_LABELS[channel]}</p>
                    {perf.sent === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">No campaigns sent yet.</p>
                    ) : (
                      <div className="mt-1 flex gap-4 text-xs text-slate-600">
                        <span>{perf.sent} sent</span>
                        <span>{formatPercent(openRate!)} open rate</span>
                        <span>{formatPercent(clickRate!)} click rate</span>
                        {perf.bounced > 0 && <span className="text-amber-600">{perf.bounced} bounced</span>}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-900">Recent campaign activity</p>
        {!summary || summary.recentActivity.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No campaigns yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {summary.recentActivity.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <button
                  onClick={() => navigate(`/campaigns/${c.id}`)}
                  className="text-slate-700 hover:text-slate-900 hover:underline"
                >
                  {c.name}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{CHANNEL_LABELS[c.channel]}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAMPAIGN_STATUS_STYLES[c.status]}`}
                  >
                    {c.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
