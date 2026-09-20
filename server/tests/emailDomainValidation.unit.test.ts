import { describe, expect, it } from "vitest";

// Real DNS lookups against real domains — no mocking. gmail.com genuinely has MX records and a
// long, deliberately-invalid domain genuinely doesn't; these are the two outcomes the whole
// feature exists to distinguish, so faking the DNS layer would test nothing real.
describe("email domain validation (real DNS lookups, no fabrication)", () => {
  it("confirms a real provider's domain has MX records", async () => {
    const { checkMxRecord } = await import("../src/lib/emailDomainValidation.js");
    expect(await checkMxRecord("gmail.com")).toBe("valid");
  }, 10000);

  it("confirms a domain that cannot possibly exist has no MX records", async () => {
    const { checkMxRecord } = await import("../src/lib/emailDomainValidation.js");
    const result = await checkMxRecord("this-domain-definitely-does-not-exist-abc123xyz-nissan-test.com");
    expect(result).toBe("invalid");
  }, 10000);

  it("treats RFC 2606 reserved documentation domains as unknown, never invalid", async () => {
    const { checkMxRecord } = await import("../src/lib/emailDomainValidation.js");
    // This app's own test suite uses "@xyztest.example" addresses throughout — if these resolved
    // as "invalid" instead of "unknown", the new channelAddressWhere filter would silently exclude
    // nearly every contact created by every other test file from EMAIL campaign eligibility.
    expect(await checkMxRecord("phase2test.example")).toBe("unknown");
    expect(await checkMxRecord("anything.test")).toBe("unknown");
    expect(await checkMxRecord("example.com")).toBe("unknown");
  });

  it("caches a repeat lookup instead of hitting DNS again", async () => {
    const { checkMxRecord } = await import("../src/lib/emailDomainValidation.js");
    const first = await checkMxRecord("yahoo.com");
    const start = Date.now();
    const second = await checkMxRecord("yahoo.com");
    expect(second).toBe(first);
    // A cached hit is effectively instant; a real repeat DNS round-trip would not be.
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("batches a list of emails into one lookup per distinct domain", async () => {
    const { checkEmailDomains } = await import("../src/lib/emailDomainValidation.js");
    const results = await checkEmailDomains([
      "a@gmail.com",
      "b@gmail.com",
      "c@this-domain-definitely-does-not-exist-abc123xyz-nissan-test.com",
      null,
      "",
    ]);
    expect(results.get("gmail.com")).toBe("valid");
    expect(results.get("this-domain-definitely-does-not-exist-abc123xyz-nissan-test.com")).toBe("invalid");
    expect(results.size).toBe(2); // one entry per distinct domain, not per email
  }, 10000);

  it("suggests a correction only for known near-miss typos, never for a real domain", async () => {
    const { suggestDomainCorrection } = await import("../src/lib/emailDomainValidation.js");
    expect(suggestDomainCorrection("gmail.co")).toBe("gmail.com");
    expect(suggestDomainCorrection("yahooo.com")).toBe("yahoo.com");
    expect(suggestDomainCorrection("gmail.com")).toBeUndefined();
    expect(suggestDomainCorrection("some-real-business.com")).toBeUndefined();
  });
});
