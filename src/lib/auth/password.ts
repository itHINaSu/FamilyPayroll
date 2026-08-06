import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt from node:crypto rather than argon2.
 *
 * argon2 would be marginally stronger, but it is a native module that has to
 * compile or find a prebuild for every architecture this image might run on —
 * an old Surface, a Pi, an x86 NAS. scrypt is in the standard library, has no
 * build step, and at these parameters is entirely adequate for a household with
 * two parent logins behind a home network.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString(
    "base64url",
  )}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");

  const derived = await scryptAsync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });

  // Lengths already match by construction, but timingSafeEqual throws if they
  // ever diverge — guard rather than let a malformed row crash the login route.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Minimum viable policy. These are household logins, not public accounts. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}
