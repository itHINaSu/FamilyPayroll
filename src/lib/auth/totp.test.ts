import { describe, expect, it } from "vitest";

import { base32Decode, base32Encode, generateRecoveryCodes, verifyTotp } from "./totp";

describe("totp", () => {
  it("round-trips base32 encode/decode", () => {
    for (const input of ["", "f", "fo", "foo", "foob", "fooba", "foobar", "family payroll"]) {
      const bytes = Buffer.from(input, "utf8");
      expect(base32Decode(base32Encode(bytes)).toString("utf8")).toBe(input);
    }
  });

  it("matches the RFC 4226 HOTP test vectors via TOTP at engineered timestamps", () => {
    // RFC 4226 Appendix D: ASCII secret "12345678901234567890", HOTP(counter)
    // for counter 0..9. verifyTotp is TOTP (a 30s-stepped HOTP), so picking a
    // timestamp that lands exactly on each counter reuses the same vectors.
    const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    const expected = [
      "755224", "287082", "359152", "969429", "338314",
      "254676", "287922", "162583", "399871", "520489",
    ];

    expected.forEach((code, counter) => {
      const at = counter * 30_000; // land exactly on this counter's 30s step
      expect(verifyTotp(secret, code, at)).toBe(true);
    });
  });

  it("rejects a code far outside the drift window", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    // Counter 0's code, checked five steps later — outside the ±1 window.
    expect(verifyTotp(secret, "755224", 5 * 30_000)).toBe(false);
  });

  it("rejects garbage input without throwing", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    expect(verifyTotp(secret, "")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "12345")).toBe(false);
  });

  it("generates the requested number of unique recovery codes", () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
  });
});
