interface MimeMessageInput {
  from: string; // "Display Name <address@gmail.com>" — address must match the connected account
  to: string;
  subject: string;
  html: string;
}

function encodeHeaderValue(value: string): string {
  // RFC 2047 encoded-word for any non-ASCII subject/name content (e.g. "Jo Gahiton" is fine as-is,
  // but this keeps things correct for accented names, emoji, etc).
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

// Builds a "Display Name <address>" From/Reply-To header value. A display name is admin-entered
// free text (see gmailAuth.service.ts's senderName), so it's quoted whenever it contains anything
// that would otherwise break RFC 2822 address-list parsing (a comma, angle bracket, or quote).
export function formatDisplayAddress(name: string, address: string): string {
  const encoded = encodeHeaderValue(name);
  const needsQuoting = encoded === name && /[,<>"]/.test(name);
  const display = needsQuoting ? `"${name.replace(/"/g, '\\"')}"` : encoded;
  return `${display} <${address}>`;
}

// Builds a minimal RFC 2822 message and base64url-encodes it, as required by
// gmail.users.messages.send's `raw` field.
export function buildMimeMessage(input: MimeMessageInput): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  const message = `${headers.join("\r\n")}\r\n\r\n${input.html}`;
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
