function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface RenderEmailInput {
  message: string; // plain text with {{var}} already substituted
  imageUrl?: string | null;
  imagePosition?: "TOP" | "BOTTOM" | null;
  ctaLabel?: string | null;
  // The caller decides what this points to — the campaign's real CTA URL for a test send (no
  // recipient row to attribute a click to), or a click-tracking redirect URL for a real send.
  // Either way this file just renders whatever link it's given; it has no tracking logic itself.
  ctaUrl?: string | null;
  unsubscribeUrl: string;
  // Present only for a real (non-test) send, where there's a CampaignRecipient row to attribute
  // an open to. Omitted entirely for test sends rather than pointed at a dead endpoint.
  trackingPixelUrl?: string | null;
}

// Composable is stored as plain text (see Template/Campaign `message` fields) so HTML-escape it
// before embedding — it is never trusted as raw markup, which also rules out HTML injection via
// a contact-supplied field reaching this template.
export function renderEmailHtml(input: RenderEmailInput): string {
  const bodyHtml = escapeHtml(input.message).replace(/\n/g, "<br>");

  const imageHtml = input.imageUrl
    ? `<img src="${escapeHtml(input.imageUrl)}" alt="" style="max-width:100%;border-radius:8px;${
        input.imagePosition === "BOTTOM" ? "margin-top:16px;" : "margin-bottom:16px;"
      }" />`
    : "";

  const ctaHtml =
    input.ctaLabel && input.ctaUrl
      ? `<p style="margin-top:24px;"><a href="${escapeHtml(input.ctaUrl)}" style="background:#0f172a;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">${escapeHtml(input.ctaLabel)}</a></p>`
      : "";

  const pixelHtml = input.trackingPixelUrl
    ? `<img src="${escapeHtml(input.trackingPixelUrl)}" alt="" width="1" height="1" style="display:block;border:0;" />`
    : "";

  const imageBeforeMessage = input.imagePosition !== "BOTTOM";

  return `<!doctype html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;">
    ${imageBeforeMessage ? imageHtml : ""}
    <p style="font-size:15px;line-height:1.5;">${bodyHtml}</p>
    ${imageBeforeMessage ? "" : imageHtml}
    ${ctaHtml}
    <hr style="margin-top:32px;border:none;border-top:1px solid #e2e8f0;" />
    <p style="font-size:12px;color:#94a3b8;margin-top:16px;">
      You're receiving this because you're a customer or prospect of ours.
      <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#94a3b8;">Unsubscribe</a>
    </p>
    ${pixelHtml}
  </body>
</html>`;
}
