import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { campaignsApi, integrationsApi } from "../../lib/campaignsApi";
import { segmentsApi } from "../../lib/segmentsApi";
import { templatesApi } from "../../lib/templatesApi";
import { ApiError } from "../../lib/api";
import {
  CAMPAIGN_STATUS_STYLES,
  CAMPAIGN_TYPES,
  CHANNELS,
  CHANNEL_TO_INTEGRATION_TYPE,
  PERSONALIZATION_VARIABLES,
} from "../../lib/constants";
import { TemplatePreview } from "../Templates/TemplatePreview";
import { ImageUrlField } from "../../components/ui/ImageUrlField";
import { PreSendConfirmDialog } from "./PreSendConfirmDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import type {
  AudiencePreview,
  Campaign,
  ConsentChannel,
  ImagePosition,
  Integration,
  Segment,
  Template,
} from "../../types";

const EDITABLE_STATUSES = ["DRAFT", "SCHEDULED", "PAUSED"];

export function CampaignBuilder() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(CAMPAIGN_TYPES[0]);
  const [channel, setChannel] = useState<ConsentChannel>("EMAIL");
  const [segmentId, setSegmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePosition, setImagePosition] = useState<ImagePosition>("TOP");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [whatsappTemplateName, setWhatsappTemplateName] = useState("");
  const [whatsappTemplateLanguage, setWhatsappTemplateLanguage] = useState("en");

  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTestMode, setConfirmTestMode] = useState(false);

  const status = campaign?.status ?? "DRAFT";
  const editable = EDITABLE_STATUSES.includes(status);
  // A campaign that hit a batch/daily-limit stop sits in SENDING between calls — sendable again
  // (to continue) without being content-editable again.
  const canSend = editable || status === "SENDING";
  const integrationConnected = integrations.some(
    (i) => i.type === CHANNEL_TO_INTEGRATION_TYPE[channel] && i.status === "CONNECTED",
  );

  useEffect(() => {
    segmentsApi.list().then((r) => setSegments(r.segments));
    templatesApi.list().then((r) => setTemplates(r.templates));
    integrationsApi.list().then((r) => setIntegrations(r.integrations));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    campaignsApi
      .get(id!)
      .then((r) => {
        const c = r.campaign;
        setCampaign(c);
        setName(c.name);
        setType(c.type);
        setChannel(c.channel);
        setSegmentId(c.segmentId ?? "");
        setTemplateId(c.templateId ?? "");
        setSubject(c.subject ?? "");
        setMessage(c.message);
        setImageUrl(c.imageUrl ?? "");
        setImagePosition(c.imagePosition);
        setCtaLabel(c.ctaLabel ?? "");
        setCtaUrl(c.ctaUrl ?? "");
        setWhatsappTemplateName(c.whatsappTemplateName ?? "");
        setWhatsappTemplateLanguage(c.whatsappTemplateLanguage ?? "en");
      })
      .catch(() => setError("Could not load this campaign."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  useEffect(() => {
    if (!segmentId) {
      setAudience(null);
      return;
    }
    setAudienceLoading(true);
    const timer = setTimeout(() => {
      campaignsApi
        .audiencePreview(segmentId, channel)
        .then(setAudience)
        .catch(() => setAudience(null))
        .finally(() => setAudienceLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [segmentId, channel]);

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const template = templates.find((t) => t.id === nextTemplateId);
    if (!template) return;
    setChannel(template.channel);
    setSubject(template.subject ?? "");
    setMessage(template.body);
    setImageUrl(template.imageUrl ?? "");
    setImagePosition(template.imagePosition);
    setCtaLabel(template.ctaLabel ?? "");
    setCtaUrl(template.ctaUrl ?? "");
  }

  function insertVariable(variableKey: string) {
    const token = `{{${variableKey}}}`;
    const textarea = bodyRef.current;
    if (!textarea) {
      setMessage((prev) => prev + token);
      return;
    }
    const start = textarea.selectionStart ?? message.length;
    const end = textarea.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    });
  }

  function buildInput() {
    return {
      name,
      type,
      channel,
      segmentId,
      templateId: templateId || undefined,
      subject: channel === "EMAIL" ? subject : undefined,
      message,
      imageUrl: imageUrl || undefined,
      imagePosition: channel === "EMAIL" ? imagePosition : undefined,
      ctaLabel: ctaLabel || undefined,
      ctaUrl: ctaUrl || undefined,
      whatsappTemplateName: channel === "WHATSAPP" ? whatsappTemplateName || undefined : undefined,
      whatsappTemplateLanguage: channel === "WHATSAPP" ? whatsappTemplateLanguage || "en" : undefined,
    };
  }

  function validate(): string | null {
    if (!name.trim()) return "Give this campaign a name.";
    if (!segmentId) return "Choose a target audience segment.";
    if (!message.trim()) return "The message can't be empty.";
    if (channel === "EMAIL" && !subject.trim()) return "Email campaigns need a subject line.";
    if ((ctaLabel && !ctaUrl) || (ctaUrl && !ctaLabel)) {
      return "Set both a CTA label and a CTA URL, or leave both blank.";
    }
    return null;
  }

  async function saveDraft(): Promise<Campaign | null> {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return null;
    }
    setError(null);
    setSaving(true);
    try {
      const input = buildInput();
      const result = isEdit ? await campaignsApi.update(id!, input) : await campaignsApi.create(input);
      setCampaign(result.campaign);
      return result.campaign;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this campaign.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveClick() {
    const saved = await saveDraft();
    if (saved && !isEdit) {
      navigate(`/campaigns/${saved.id}`, { replace: true });
    } else if (saved) {
      setNotice("Saved.");
      setTimeout(() => setNotice(null), 2000);
    }
  }

  async function handleDuplicate() {
    if (!campaign) return;
    const result = await campaignsApi.duplicate(campaign.id);
    navigate(`/campaigns/${result.campaign.id}`);
  }

  async function handleScheduleConfirm(isoDateTime: string) {
    setScheduleError(null);
    const wasUnsaved = !id;
    const target = await saveDraft();
    if (!target) return;
    try {
      const result = await campaignsApi.schedule(target.id, isoDateTime);
      setCampaign(result.campaign);
      setScheduleOpen(false);
      if (wasUnsaved) navigate(`/campaigns/${result.campaign.id}`, { replace: true });
    } catch (err) {
      setScheduleError(err instanceof ApiError ? err.message : "Could not schedule this campaign.");
    }
  }

  async function handlePause() {
    if (!campaign) return;
    const result = await campaignsApi.pause(campaign.id);
    setCampaign(result.campaign);
  }

  async function handleCancelCampaign() {
    if (!campaign) return;
    const result = await campaignsApi.cancel(campaign.id);
    setCampaign(result.campaign);
  }

  async function openSendConfirm(testMode: boolean) {
    // A SENDING campaign's content is already locked in from its first batch — this call is a
    // resume/"send next batch", not a fresh compose, so skip re-saving (which the backend refuses
    // for a non-editable status anyway).
    if (campaign && status === "SENDING") {
      setConfirmTestMode(testMode);
      setConfirmOpen(true);
      return;
    }
    const wasUnsaved = !id;
    const target = await saveDraft();
    if (!target) return;
    if (wasUnsaved) navigate(`/campaigns/${target.id}`, { replace: true });
    setConfirmTestMode(testMode);
    setConfirmOpen(true);
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {isEdit ? "Edit campaign" : "New campaign"}
          </h1>
          {campaign && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CAMPAIGN_STATUS_STYLES[status]}`}
            >
              {status}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/campaigns")}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
          {campaign && (
            <button
              onClick={handleDuplicate}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Duplicate
            </button>
          )}
          {editable && (
            <button
              onClick={handleSaveClick}
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}
      {!editable && (
        <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          This campaign is {status.toLowerCase()} and can no longer be edited.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <fieldset disabled={!editable} className="contents">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Campaign name *</span>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Campaign type</span>
                <select className="input mt-1" value={type} onChange={(e) => setType(e.target.value)}>
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-500">Target audience (segment) *</span>
              <select
                className="input mt-1"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
              >
                <option value="">— Select a segment —</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {segments.length === 0 && (
                <span className="mt-1 block text-xs text-amber-600">
                  No segments yet — create one under Segments first.
                </span>
              )}
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-500">Start from a template (optional)</span>
              <select
                className="input mt-1"
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
              >
                <option value="">— Write from scratch —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel})
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-500">Channel</span>
              <div className="mt-1 flex gap-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={
                      channel === c
                        ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                        : "rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    }
                  >
                    {c === "EMAIL" ? "Email" : c === "WHATSAPP" ? "WhatsApp" : "Viber"}
                  </button>
                ))}
              </div>
            </label>

            {channel === "EMAIL" && (
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-500">Subject *</span>
                <input className="input mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
            )}

            {channel === "WHATSAPP" && (
              <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-medium">Marketing messages require a Meta-approved template</p>
                <p className="mt-1">
                  Free-form text below is for internal preview only — the real send uses the
                  template named here. List your personalization tokens in the message in the same
                  order as your template's numbered variables ({"{{1}}"}, {"{{2}}"}, …); they're
                  mapped positionally.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] font-medium text-amber-700">Template name *</span>
                    <input
                      className="input mt-1"
                      value={whatsappTemplateName}
                      onChange={(e) => setWhatsappTemplateName(e.target.value)}
                      placeholder="e.g. new_vehicle_promo"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-amber-700">Language code</span>
                    <input
                      className="input mt-1"
                      value={whatsappTemplateLanguage}
                      onChange={(e) => setWhatsappTemplateLanguage(e.target.value)}
                      placeholder="en"
                    />
                  </label>
                </div>
              </div>
            )}

            {channel === "VIBER" && (
              <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-medium">Viber can only message subscribed contacts</p>
                <p className="mt-1">
                  A contact must have messaged your Public Account first — this platform can never
                  send to a phone number alone. Generate a personal invite link from a contact's
                  record on the Contacts page to get them started.
                </p>
              </div>
            )}

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Message *</span>
                <div className="flex flex-wrap gap-1">
                  {PERSONALIZATION_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertVariable(v.key)}
                      className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                      title={`Insert {{${v.key}}}`}
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                ref={bodyRef}
                className="input mt-1 min-h-[120px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-500">Image</span>
              <div className="mt-1">
                <ImageUrlField value={imageUrl} onChange={setImageUrl} />
              </div>
            </label>
            {channel === "EMAIL" && imageUrl && (
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-500">Image position</span>
                <select
                  className="input mt-1"
                  value={imagePosition}
                  onChange={(e) => setImagePosition(e.target.value as ImagePosition)}
                >
                  <option value="TOP">Above message</option>
                  <option value="BOTTOM">Below message</option>
                </select>
              </label>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">CTA button label</span>
                <input className="input mt-1" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">CTA URL</span>
                <input className="input mt-1" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
              </label>
            </div>
          </fieldset>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">Live preview (using sample data)</p>
          <div className="mt-2">
            <TemplatePreview
              channel={channel}
              subject={subject}
              body={message}
              imageUrl={imageUrl}
              imagePosition={imagePosition}
              ctaLabel={ctaLabel}
              ctaUrl={ctaUrl}
            />
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">Audience</p>
            {!segmentId && <p className="mt-1 text-sm text-slate-400">Select a segment to preview reach.</p>}
            {segmentId && audienceLoading && <p className="mt-1 text-sm text-slate-400">Calculating…</p>}
            {segmentId && !audienceLoading && audience && (
              <div className="mt-1 space-y-1 text-sm">
                <p className="text-slate-600">{audience.totalMatching} contacts match this segment</p>
                {audience.optedOutCount > 0 && (
                  <p className="text-amber-600">
                    {audience.optedOutCount} excluded (opted out of {CHANNEL_LABEL(channel)})
                  </p>
                )}
                {audience.noConsentCount > 0 && (
                  <p className="text-amber-600">
                    {audience.noConsentCount} excluded (no recorded {CHANNEL_LABEL(channel)} opt-in)
                  </p>
                )}
                {audience.noAddressCount > 0 && (
                  <p className="text-amber-600">
                    {audience.noAddressCount} excluded ({NO_ADDRESS_LABEL(channel)})
                  </p>
                )}
                <p className="font-semibold text-slate-900">
                  {audience.estimatedMessages} estimated message{audience.estimatedMessages === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">Sending</p>
            {!integrationConnected && (
              <p className="mt-1 text-xs text-amber-700">
                No connected {channel === "EMAIL" ? "Gmail" : channel} integration yet — sending is
                blocked until one is connected under Integrations. This never simulates a send.
              </p>
            )}
            {(status === "SENDING" || status === "PAUSED") &&
              typeof campaign?.remainingCount === "number" && (
                <p className="mt-1 text-xs text-slate-600">
                  {campaign.sentCount ?? 0} sent so far
                  {campaign.remainingCount > 0
                    ? ` — ${campaign.remainingCount} recipient${campaign.remainingCount === 1 ? "" : "s"} still to go.`
                    : "."}
                </p>
              )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => openSendConfirm(true)}
                disabled={!canSend}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Test send
              </button>
              <button
                onClick={() => openSendConfirm(false)}
                disabled={!canSend}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {status === "SENDING" ? "Send next batch" : "Send now"}
              </button>
              {editable && (status === "DRAFT" || status === "PAUSED" || status === "SCHEDULED") && (
                <button
                  onClick={() => setScheduleOpen(true)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  {status === "SCHEDULED" ? "Reschedule" : "Schedule"}
                </button>
              )}
              {(status === "SCHEDULED" || status === "SENDING") && (
                <button
                  onClick={handlePause}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Pause
                </button>
              )}
              {(status === "DRAFT" || status === "SCHEDULED" || status === "PAUSED") && (
                <button
                  onClick={handleCancelCampaign}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Cancel campaign
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        initialValue={campaign?.scheduledAt}
        onConfirm={handleScheduleConfirm}
        onCancel={() => {
          setScheduleOpen(false);
          setScheduleError(null);
        }}
        error={scheduleError}
      />

      <PreSendConfirmDialog
        open={confirmOpen}
        campaign={campaign}
        audience={audience}
        testMode={confirmTestMode}
        onClose={() => setConfirmOpen(false)}
        onSent={() => {
          if (campaign) campaignsApi.get(campaign.id).then((r) => setCampaign(r.campaign));
        }}
      />
    </div>
  );
}

function CHANNEL_LABEL(channel: ConsentChannel) {
  return channel === "EMAIL" ? "Email" : channel === "WHATSAPP" ? "WhatsApp" : "Viber";
}

function NO_ADDRESS_LABEL(channel: ConsentChannel) {
  if (channel === "EMAIL") return "no email on file";
  if (channel === "WHATSAPP") return "no WhatsApp number on file";
  return "not yet subscribed on Viber";
}
