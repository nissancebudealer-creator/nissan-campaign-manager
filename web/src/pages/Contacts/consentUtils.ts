import type { Consent, ConsentChannel } from "../../types";

export function latestConsent(consents: Consent[], channel: ConsentChannel): Consent | null {
  const forChannel = consents.filter((c) => c.channel === channel);
  if (forChannel.length === 0) return null;
  return forChannel.reduce((latest, c) =>
    new Date(c.consentDate) > new Date(latest.consentDate) ? c : latest,
  );
}

export const CHANNEL_LABELS: Record<ConsentChannel, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  VIBER: "Viber",
};
