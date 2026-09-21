// Gmail API sending limits, as documented by Google. These are per authenticated Gmail account,
// per rolling 24h. There is no way around them via this API — hitting the ceiling returns a
// 429/rate-limit error from Google, and this app must stop and report it, not retry into a ban.
// See DEPLOYMENT.md / the Integrations screen for how these surface to the user.
export const GMAIL_DAILY_LIMITS = {
  CONSUMER: 500, // regular @gmail.com account
  WORKSPACE: 2000, // Google Workspace account
} as const;

// Conservative default assumption until the connected account's type is confirmed — a consumer
// Gmail account is the common case for a small dealership and the safer (lower) limit to assume.
export const DEFAULT_DAILY_LIMIT = GMAIL_DAILY_LIMITS.CONSUMER;

// Gmail also enforces an unpublished per-user rate limit well below the daily cap — bursts of
// 50-100 sends at 1200ms apart can still trigger Google's 6,000 units/minute per-user quota and
// anti-spam burst protection ("User-rate limit exceeded ... Retry after" rejection). Spacing sends
// to 2500ms (~24 messages/minute) stays comfortably under Google's quota and avoids triggering
// temporary rate limit throttles while keeping batch sends reasonably fast.
export const SEND_DELAY_MS = 2500;

export const MAX_SEND_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;
