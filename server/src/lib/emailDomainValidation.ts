import dns from "node:dns";
import { logger } from "../utils/logger.js";

// Common near-miss typos of major providers — exactly the pattern that got this app's Google
// Cloud project flagged for abuse (a real "gmail.co" address was in a sent campaign). Used only to
// enrich the error message when the domain is ALSO confirmed to have no mail server; a domain that
// merely resembles one of these but has real MX records (e.g. a legitimate lookalike business
// domain) is never blocked on the typo match alone.
const KNOWN_TYPOS: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.cm": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "icloud.co": "icloud.com",
};

export function suggestDomainCorrection(domain: string): string | undefined {
  return KNOWN_TYPOS[domain.toLowerCase()];
}

export type DomainCheckResult = "valid" | "invalid" | "unknown";

const MX_LOOKUP_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — long enough to cover one bulk import or send

const cache = new Map<string, { result: DomainCheckResult; expiresAt: number }>();

// RFC 2606 reserves these specifically for documentation/testing — they're guaranteed to never be
// registered for real mail, so a real MX lookup against them is not a meaningful signal either way
// (this app's own test suite uses "@xyztest.example" addresses throughout). Universal, not
// test-environment-gated: a reserved domain carries no real information for any caller.
const RESERVED_DOCS_DOMAINS = new Set(["example.com", "example.net", "example.org"]);
function isReservedDocsDomain(domain: string): boolean {
  return domain.endsWith(".example") || domain.endsWith(".test") || domain.endsWith(".invalid") ||
    RESERVED_DOCS_DOMAINS.has(domain);
}

function resolveMxWithTimeout(domain: string): Promise<DomainCheckResult> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // A slow/unresponsive DNS server is not evidence the domain is bad — never block on
      // ambiguity, only on a real, confirmed "no mail server" answer.
      resolve("unknown");
    }, MX_LOOKUP_TIMEOUT_MS);

    dns.resolveMx(domain, (err, addresses) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        // ENOTFOUND/ENODATA is DNS confirming no MX records exist for this domain at all — a real,
        // definitive signal the domain cannot receive mail. Any other error (timeout, server
        // failure, our own network hiccup) is inconclusive, not evidence of invalidity.
        if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
          resolve("invalid");
        } else {
          logger.warn("MX lookup failed inconclusively", { domain, code: err.code });
          resolve("unknown");
        }
        return;
      }
      resolve(addresses.length > 0 ? "valid" : "invalid");
    });
  });
}

// Real DNS check — never fabricated, never a client-side format guess. Cached per-domain since a
// contact list is dominated by a handful of shared providers (gmail.com, yahoo.com, ...), so a
// 10,000-row CSV import triggers only a handful of real lookups, not one per row.
export async function checkMxRecord(domain: string): Promise<DomainCheckResult> {
  const key = domain.toLowerCase();
  if (isReservedDocsDomain(key)) return "unknown";

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const result = await resolveMxWithTimeout(key);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

// Batch entry point for CSV import — checks only the distinct domains present (not one lookup per
// row) and returns a lookup keyed by lowercased domain.
export async function checkEmailDomains(emails: (string | null | undefined)[]): Promise<Map<string, DomainCheckResult>> {
  const domains = new Set(
    emails.filter((e): e is string => Boolean(e && e.includes("@"))).map((e) => domainOf(e).toLowerCase()),
  );
  const results = new Map<string, DomainCheckResult>();
  await Promise.all(
    Array.from(domains).map(async (domain) => {
      results.set(domain, await checkMxRecord(domain));
    }),
  );
  return results;
}

export { domainOf };
