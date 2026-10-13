import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../../lib/analyticsApi";
import { CAMPAIGN_STATUS_STYLES } from "../../lib/constants";
import type { CampaignReportEntry } from "../../types";
import { ReportRecipientsModal, type RecipientCategory } from "./ReportRecipientsModal";

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", VIBER: "Viber" };

type SortKey = "sentAt" | "sent" | "openRate" | "clickRate";

function formatPercent(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function Reports() {
  const [reports, setReports] = useState<CampaignReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [recipientModalState, setRecipientModalState] = useState<{
    campaignId: string;
    campaignName: string;
    channel: string;
    category: RecipientCategory;
  } | null>(null);
  const navigate = useNavigate();

  const openRecipients = (
    campaign: { id: string; name: string; channel: string },
    category: RecipientCategory
  ) => {
    setRecipientModalState({
      campaignId: campaign.id,
      campaignName: campaign.name,
      channel: campaign.channel,
      category,
    });
  };

  useEffect(() => {
    analyticsApi
      .campaignReports()
      .then((r) => setReports(r.reports))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...reports].sort((a, b) => {
    if (sortKey === "sentAt") {
      return (b.campaign.sentAt ?? "").localeCompare(a.campaign.sentAt ?? "");
    }
    if (sortKey === "sent") return b.metrics.sent - a.metrics.sent;
    if (sortKey === "openRate") return b.metrics.openRate - a.metrics.openRate;
    return b.metrics.clickRate - a.metrics.clickRate;
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
      <p className="mt-1 text-sm text-slate-600">
        Every sent campaign, side by side, for comparison. All figures come from real provider API
        responses and real recipient interactions (open pixel, click redirect) — nothing here is
        estimated.
      </p>

      <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
        <strong className="text-slate-700">Two metrics you won't find here, on purpose:</strong>{" "}
        "Delivered" — none of Gmail, WhatsApp, or Viber's send APIs confirm final inbox delivery,
        so we report "Sent" (what we can actually confirm) instead of claiming delivery.
        "Conversion" — no goal or e-commerce integration exists yet to attribute a conversion to a
        send.
      </div>

      <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
        <strong className="text-slate-700">Open/click tracking coverage varies by channel:</strong>{" "}
        Email gets a real tracking pixel and click-redirect. Viber's CTA link is also tracked the
        same way. WhatsApp template messages are Meta-controlled — this app doesn't rewrite an
        approved template's buttons, so WhatsApp campaigns will always show 0 opened/clicked here,
        not because nothing happened but because there's no honest way to observe it yet.
      </div>

      <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
        <strong className="text-slate-700">Bounced is Email-only.</strong> It counts real bounce
        notifications Gmail sent back for an invalid or unreachable address, checked every few
        minutes — WhatsApp and Viber have no equivalent signal, so they'll always show 0 here.
      </div>

      <div className="mt-4 flex gap-2 text-xs">
        <span className="text-slate-500">Sort by:</span>
        {(
          [
            ["sentAt", "Most recent"],
            ["sent", "Sent"],
            ["openRate", "Open rate"],
            ["clickRate", "Click rate"],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={
              sortKey === key
                ? "rounded-full bg-slate-900 px-2.5 py-1 font-medium text-white"
                : "rounded-full border border-slate-200 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200/70 bg-blue-50/70 px-3.5 py-2 text-xs text-blue-900">
        <span className="text-sm">💡</span>
        <span>
          <strong>Interactive reports:</strong> Click any result metric below (Recipients, Sent, Failed, Bounced, Opened, Clicked, Unsubscribed) to view recipient contact details, error diagnostics, follow up directly, or make instant contact updates.
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-2.5">Campaign</th>
              <th className="px-4 py-2.5">Channel</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Recipients</th>
              <th className="px-4 py-2.5">Sent</th>
              <th className="px-4 py-2.5">Failed</th>
              <th className="px-4 py-2.5">Bounced</th>
              <th className="px-4 py-2.5">Opened</th>
              <th className="px-4 py-2.5">Clicked</th>
              <th className="px-4 py-2.5">Open rate</th>
              <th className="px-4 py-2.5">Click rate</th>
              <th className="px-4 py-2.5">Currently unsubscribed</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-slate-400">
                  No sent campaigns yet.
                </td>
              </tr>
            )}
            {!loading &&
              sorted.map(({ campaign, metrics }) => (
                <tr key={campaign.id} className="border-t border-slate-100 hover:bg-slate-50/75 transition-colors">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                      className="font-medium text-slate-900 hover:underline cursor-pointer"
                    >
                      {campaign.name}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{CHANNEL_LABELS[campaign.channel]}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAMPAIGN_STATUS_STYLES[campaign.status]}`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  {/* Clickable Recipients */}
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openRecipients(campaign, "ALL")}
                      className="font-semibold text-slate-700 hover:text-blue-600 hover:underline cursor-pointer"
                      title="View all recipients"
                    >
                      {metrics.recipients}
                    </button>
                  </td>
                  {/* Clickable Sent */}
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openRecipients(campaign, "SENT")}
                      className="font-semibold text-slate-700 hover:text-blue-600 hover:underline cursor-pointer"
                      title="View sent contacts"
                    >
                      {metrics.sent}
                    </button>
                  </td>
                  {/* Clickable Failed */}
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openRecipients(campaign, "FAILED")}
                      className={`font-semibold cursor-pointer hover:underline ${
                        metrics.failed > 0
                          ? "text-red-600 hover:text-red-700"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                      title="View failed contacts & error diagnostics"
                    >
                      {metrics.failed}
                    </button>
                  </td>
                  {/* Clickable Bounced */}
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openRecipients(campaign, "BOUNCED")}
                      className={`font-semibold cursor-pointer hover:underline ${
                        metrics.bounced > 0
                          ? "text-amber-600 hover:text-amber-700"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                      title="View bounced contacts"
                    >
                      {metrics.bounced}
                    </button>
                  </td>
                  {/* Clickable Opened */}
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openRecipients(campaign, "OPENED")}
                      className={`font-semibold cursor-pointer hover:underline ${
                        metrics.opened > 0
                          ? "text-emerald-700 hover:text-emerald-800"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      title="View opened contacts"
                    >
                      {metrics.opened}
                    </button>
                  </td>
                  {/* Clickable Clicked */}
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openRecipients(campaign, "CLICKED")}
                      className={`font-semibold cursor-pointer hover:underline ${
                        metrics.clicked > 0
                          ? "text-blue-600 hover:text-blue-700"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      title="View clicked contacts"
                    >
                      {metrics.clicked}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {formatPercent(metrics.openRate)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {formatPercent(metrics.clickRate)}
                  </td>
                  {/* Clickable Unsubscribed */}
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openRecipients(campaign, "UNSUBSCRIBED")}
                      className={`font-semibold cursor-pointer hover:underline ${
                        metrics.unsubscribed > 0
                          ? "text-amber-600 hover:text-amber-700"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                      title="View unsubscribed contacts"
                    >
                      {metrics.unsubscribed}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Recipient Details & Follow-up Modal */}
      {recipientModalState && (
        <ReportRecipientsModal
          open={Boolean(recipientModalState)}
          campaignId={recipientModalState.campaignId}
          campaignName={recipientModalState.campaignName}
          channel={recipientModalState.channel}
          initialCategory={recipientModalState.category}
          onClose={() => setRecipientModalState(null)}
        />
      )}
    </div>
  );
}
