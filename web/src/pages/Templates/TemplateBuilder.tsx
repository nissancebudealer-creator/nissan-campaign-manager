import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { templatesApi } from "../../lib/templatesApi";
import { ApiError } from "../../lib/api";
import { CHANNELS, PERSONALIZATION_VARIABLES, TEMPLATE_CATEGORIES } from "../../lib/constants";
import { TemplatePreview } from "./TemplatePreview";
import { ImageUrlField } from "../../components/ui/ImageUrlField";
import type { ConsentChannel, ImagePosition } from "../../types";

export function TemplateBuilder() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0]);
  const [channel, setChannel] = useState<ConsentChannel>("EMAIL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePosition, setImagePosition] = useState<ImagePosition>("TOP");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    templatesApi
      .get(id!)
      .then((r) => {
        const t = r.template;
        setName(t.name);
        setCategory(t.category);
        setChannel(t.channel);
        setSubject(t.subject ?? "");
        setBody(t.body);
        setImageUrl(t.imageUrl ?? "");
        setImagePosition(t.imagePosition);
        setCtaLabel(t.ctaLabel ?? "");
        setCtaUrl(t.ctaUrl ?? "");
      })
      .catch(() => setError("Could not load this template."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function insertVariable(variableKey: string) {
    const token = `{{${variableKey}}}`;
    const textarea = bodyRef.current;
    if (!textarea) {
      setBody((prev) => prev + token);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    });
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Give this template a name.");
      return;
    }
    if (!body.trim()) {
      setError("The message body can't be empty.");
      return;
    }
    if (channel === "EMAIL" && !subject.trim()) {
      setError("Email templates need a subject line.");
      return;
    }
    if ((ctaLabel && !ctaUrl) || (ctaUrl && !ctaLabel)) {
      setError("Set both a CTA label and a CTA URL, or leave both blank.");
      return;
    }

    setSaving(true);
    try {
      const input = {
        name,
        category,
        channel,
        subject: channel === "EMAIL" ? subject : undefined,
        body,
        imageUrl: imageUrl || undefined,
        imagePosition: channel === "EMAIL" ? imagePosition : undefined,
        ctaLabel: ctaLabel || undefined,
        ctaUrl: ctaUrl || undefined,
      };
      if (isEdit) {
        await templatesApi.update(id!, input);
      } else {
        await templatesApi.create(input);
      }
      navigate("/templates");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this template.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          {isEdit ? "Edit template" : "New template"}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/templates")}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Template name *</span>
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Category</span>
              <select
                className="input mt-1"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
              <input
                className="input mt-1"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Hi {{first_name}}, an offer just for you"
              />
            </label>
          )}

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Message *</span>
              <div className="flex flex-wrap gap-1">
                {PERSONALIZATION_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    // Prevent the button click from stealing focus away from the textarea first
                    // — otherwise selectionStart/selectionEnd reset to 0 before insertVariable
                    // can read the real cursor position.
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
              className="input mt-1 min-h-[140px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, we have an exciting offer for you."
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
              <input
                className="input mt-1"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="e.g. Book a Test Drive"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">CTA URL</span>
              <input
                className="input mt-1"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">
            Live preview (using sample data — Jo Gahiton)
          </p>
          <div className="mt-2">
            <TemplatePreview
              channel={channel}
              subject={subject}
              body={body}
              imageUrl={imageUrl}
              imagePosition={imagePosition}
              ctaLabel={ctaLabel}
              ctaUrl={ctaUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
