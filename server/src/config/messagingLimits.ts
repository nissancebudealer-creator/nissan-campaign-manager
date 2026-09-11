// WhatsApp and Viber sending limits/behavior, as actually documented by each platform — see
// COMPLIANCE.md and ARCHITECTURE.md for the full picture. Unlike Gmail's flat daily cap, Meta's
// WhatsApp limit is a "messaging tier" based on the number of *unique* customers messaged in a
// rolling 24h window, and it scales up automatically as your phone number's quality rating stays
// healthy. There is no way to query "my current tier" from the API, so this app enforces the
// safest default tier and documents how to raise it once Meta has actually upgraded the number.
export const WHATSAPP_TIER_LIMITS = {
  TIER_1: 250, // every number starts here
  TIER_2: 1_000,
  TIER_3: 10_000,
  TIER_4: 100_000,
} as const;

// Every WhatsApp Business number starts at Tier 1 — raise this in the Integrations screen only
// once Meta has actually confirmed a higher tier for your number (visible in Meta Business
// Manager), never speculatively.
export const WHATSAPP_DEFAULT_DAILY_LIMIT = WHATSAPP_TIER_LIMITS.TIER_1;

// Viber's Public Account "send_message" API does not document a fixed numeric daily cap the way
// Meta does; real throughput is governed by your Public Account's standing with Viber and (for
// most dealership-scale usage) a BSP contract's own terms. We still enforce a conservative
// default so a runaway send can't hammer the API, adjustable once you know your actual contracted
// throughput.
export const VIBER_DEFAULT_DAILY_LIMIT = 1_000;

export const MAX_SEND_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;
