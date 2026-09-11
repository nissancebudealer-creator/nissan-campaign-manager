import { useState } from "react";
import { campaignsApi } from "../../lib/campaignsApi";
import { ApiError } from "../../lib/api";
import type { AudiencePreview, Campaign } from "../../types";

interface PreSendConfirmDialogProps {
  open: boolean;
  campaign: Campaign | null;
  audience: AudiencePreview | null;
  testMode: boolean;
  onClose: () => void;
  onSent?: () => void;
}

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", VIBER: "Viber" };

export function PreSendConfirmDialog({
  open,
  campaign,
  audience,
  testMode,
  onClose,
  onSent,
}: PreSendConfirmDialogProps) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!open || !campaign) return null;

  async function handleConfirm() {
    setSending(true);
    setResult(null);
    try {
      const response = await campaignsApi.send(campaign!.id, testMode);
      if ("testSentTo" in response) {
        setResult({ ok: true, message: `Test email sent to ${response.testSentTo}.` });
      } else {
        setResult({
          ok: true,
          message:
            response.failedCount > 0
              ? `Sent ${response.sentCount}, ${response.failedCount} failed — check the campaign's sending log.`
              : `Sent to all ${response.sentCount} recipient${response.sentCount === 1 ? "" : "s"}.`,
        });
        onSent?.();
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof ApiError ? err.message : "Could not send this campaign.",
      });
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">
          {testMode ? "Send a test message?" : "Send this campaign?"}
        </h2>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Campaign name" value={campaign.name} />
          <Row label="Channel" value={CHANNEL_LABELS[campaign.channel]} />
          <Row label="Number of recipients" value={String(audience?.totalMatching ?? "—")} />
          <Row
            label="Opted-out exclusions"
            value={`−${audience?.optedOutCount ?? 0}`}
          />
          <Row
            label="No recorded opt-in"
            value={`−${audience?.noConsentCount ?? 0}`}
          />
          <Row
            label="Missing a deliverable address"
            value={`−${audience?.noAddressCount ?? 0}`}
          />
          <Row
            label="Estimated messages"
            value={String(audience?.estimatedMessages ?? "—")}
            emphasize
          />
          <Row
            label="Scheduled time"
            value={campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "Immediately"}
          />
        </dl>

        {result && (
          <div
            className={`mt-4 rounded-md p-3 text-sm ${
              result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {result.message}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
          {!result?.ok && (
            <button
              onClick={handleConfirm}
              disabled={sending || (audience?.estimatedMessages ?? 0) === 0}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Confirm and send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={emphasize ? "font-semibold text-slate-900" : "text-slate-700"}>{value}</dd>
    </div>
  );
}
