import { z } from "zod";

/**
 * The login identifier.
 *
 * The `user.email` column's name is a holdover — nothing in this app ever
 * sends anything to it. It has always really been a login handle, so it is
 * validated and shown as a plain username: no `@`, no domain, just something
 * short enough to type on a shared kitchen tablet. Lowercased on the way in
 * so "Mom" and "mom" cannot register as two different logins.
 */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    USERNAME_PATTERN,
    "3-32 characters: letters, numbers, dots, underscores, or hyphens.",
  );

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}
