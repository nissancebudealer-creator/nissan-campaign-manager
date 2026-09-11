import { renderWithSampleData } from "../../lib/personalization";
import type { ConsentChannel, ImagePosition } from "../../types";

interface TemplatePreviewProps {
  channel: ConsentChannel;
  subject?: string | null;
  body: string;
  imageUrl?: string | null;
  imagePosition?: ImagePosition;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export function TemplatePreview({
  channel,
  subject,
  body,
  imageUrl,
  imagePosition = "TOP",
  ctaLabel,
  ctaUrl,
}: TemplatePreviewProps) {
  const renderedSubject = renderWithSampleData(subject);
  const renderedBody = renderWithSampleData(body);

  if (channel === "EMAIL") {
    const image = imageUrl && (
      <img
        src={imageUrl}
        alt=""
        className={`max-h-40 w-full rounded-md object-cover ${imagePosition === "BOTTOM" ? "mt-3" : "mb-3"}`}
      />
    );
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Subject: <span className="font-medium text-slate-700">{renderedSubject || "—"}</span>
        </div>
        <div className="p-4">
          {imagePosition !== "BOTTOM" && image}
          <p className="whitespace-pre-wrap text-sm text-slate-700">{renderedBody || "—"}</p>
          {imagePosition === "BOTTOM" && image}
          {ctaLabel && ctaUrl && (
            <div className="mt-4">
              <span className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                {ctaLabel}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // WhatsApp / Viber: a chat-bubble style preview
  return (
    <div className="rounded-lg bg-slate-100 p-4">
      <div className="max-w-xs rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
        {imageUrl && (
          <img src={imageUrl} alt="" className="mb-2 max-h-32 w-full rounded-lg object-cover" />
        )}
        <p className="whitespace-pre-wrap text-sm text-slate-700">{renderedBody || "—"}</p>
        {ctaLabel && ctaUrl && (
          <div className="mt-2 border-t border-slate-100 pt-2 text-center text-sm font-medium text-blue-600">
            {ctaLabel}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {channel === "WHATSAPP" ? "WhatsApp" : "Viber"} preview — actual rendering depends on the
        provider's app.
      </p>
    </div>
  );
}
