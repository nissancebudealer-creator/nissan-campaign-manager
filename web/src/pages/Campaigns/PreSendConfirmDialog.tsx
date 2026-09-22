import { useState, useEffect } from "react";
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

function formatMessageTimestamps(msg: string): string {
  return msg.replace(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\b/g, (_, iso) => {
    const withZ = iso.endsWith("Z") ? iso : iso + "Z";
    const date = new Date(withZ);
    if (Number.isNaN(date.getTime())) return iso;
    return (
      date.toLocaleTimeString("en-US", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }) + " (PH time)"
    );
  });
}

export function PreSendConfirmDialog({
  open,
  campaign,
  audience,
  testMode,
  onClose,
  onSent,
}: PreSendConfirmDialogProps) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [batchSize, setBatchSize] = useState("");
  const [throttledUntil, setThrottledUntil] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  useEffect(() => {
    if (!throttledUntil) {
      setCooldownRemaining(0);
      return;
    }
    function updateCooldown() {
      const diff = Math.ceil((new Date(throttledUntil!).getTime() - Date.now()) / 1000);
      setCooldownRemaining(diff > 0 ? diff : 0);
    }
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [throttledUntil]);

  if (!open || !campaign) return null;

  const isResume = campaign.status === "SENDING";

  async function handleConfirm() {
    setSending(true);
    setResult(null);
    try {
      const parsedBatchSize = batchSize.trim() ? Number(batchSize) : undefined;
      const response = await campaignsApi.send(campaign!.id, testMode, parsedBatchSize);
      if ("testSentTo" in response) {
        setResult({ type: "success", message: `Test email sent to ${response.testSentTo}.` });
      } else {
        const remainingNote =
          response.remainingCount > 0
            ? ` ${response.remainingCount} recipient${response.remainingCount === 1 ? "" : "s"} still to go — click "Send next batch" to continue.`
            : " Everyone eligible has now been sent to.";
        // throttledReason is only ever set when the batch stopped early because of a real
        // provider-side limit (daily cap or Gmail's shorter-window rate limit), not a per-
        // recipient failure — surfaced distinctly as a warning so it never masquerades as a normal success.
        if (response.throttledUntil) {
          setThrottledUntil(response.throttledUntil);
        } else if (response.throttledReason) {
          const isoMatch = response.throttledReason.match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\b/);
          if (isoMatch) {
            setThrottledUntil(isoMatch[1].endsWith("Z") ? isoMatch[1] : isoMatch[1] + "Z");
          }
        }

        if (response.throttledReason) {
          setResult({
            type: "warning",
            message: `${response.throttledReason} (${response.sentCount} sent this batch.)`,
          });
        } else if (response.failedCount > 0) {
          setResult({
            type: "warning",
            message: `Sent ${response.sentCount}, ${response.failedCount} failed — check the campaign's sending log.${remainingNote}`,
          });
        } else {
          setResult({
            type: "success",
            message: `Sent ${response.sentCount} message${response.sentCount === 1 ? "" : "s"}.${remainingNote}`,
          });
        }
        onSent?.();
      }
    } catch (err) {
      setResult({
        type: "error",
        message: err instanceof ApiError ? err.message : "Could not send this campaign.",
      });
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setResult(null);
    setBatchSize("");
    setThrottledUntil(null);
    setCooldownRemaining(0);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">
          {testMode ? "Send a test message?" : isResume ? "Send the next batch?" : "Send this campaign?"}
        </h2>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Campaign name" value={campaign.name} />
          <Row label="Channel" value={CHANNEL_LABELS[campaign.channel]} />
          {isResume ? (
            <>
              <Row label="Sent so far" value={String(campaign.sentCount ?? 0)} />
              <Row
                label="Remaining recipients"
                value={String(campaign.remainingCount ?? "—")}
                emphasize
              />
            </>
          ) : (
            <>
              <Row label="Number of recipients" value={String(audience?.totalMatching ?? "—")} />
              <Row label="Opted-out exclusions" value={`−${audience?.optedOutCount ?? 0}`} />
              <Row label="No recorded opt-in" value={`−${audience?.noConsentCount ?? 0}`} />
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
            </>
          )}
        </dl>

        {!testMode && (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-500">
              Batch size (optional — leave blank to send to everyone eligible right now)
            </span>
            <input
              type="number"
              min={1}
              placeholder="e.g. 25 or 50"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              className="input mt-1"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Sends only this many, then stops — recommended 25–50 for Gmail to avoid provider rate limits.
              Click "Send next batch" afterward to continue.
            </span>
          </label>
        )}

        {result && (
          <div
            className={`mt-4 rounded-md p-3 text-sm ${
              result.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : result.type === "warning"
                  ? "border border-amber-200 bg-amber-50 text-amber-900"
                  : "border border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {formatMessageTimestamps(result.message)}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
          {result?.type !== "success" && (
            <button
              onClick={handleConfirm}
              disabled={
                sending ||
                cooldownRemaining > 0 ||
                (testMode
                  ? false
                  : isResume
                    ? (campaign.remainingCount ?? 0) === 0
                    : (audience?.estimatedMessages ?? 0) === 0)
              }
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {sending
                ? "Sending…"
                : cooldownRemaining > 0
                  ? `Cooldown (${Math.floor(cooldownRemaining / 60)}m ${cooldownRemaining % 60}s)`
                  : isResume
                    ? "Send next batch"
                    : "Confirm and send"}
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
