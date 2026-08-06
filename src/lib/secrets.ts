import "server-only";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSecret } from "@/db/schema";

/**
 * Secrets self-generate on first boot and persist in the data volume.
 *
 * This is what makes `docker compose up -d` a complete install: nobody has to
 * invent a session secret or run a VAPID keygen before the app will start. It
 * also means the secrets survive container replacement, so sessions and push
 * subscriptions are not invalidated by a routine image pull.
 *
 * Stored apart from `household` so exports can exclude the whole table.
 */

export const SECRET_KEYS = {
  sessionSecret: "session_secret",
  vapidPublicKey: "vapid_public_key",
  vapidPrivateKey: "vapid_private_key",
} as const;

export function getSecret(key: string): string | null {
  const row = db
    .select()
    .from(appSecret)
    .where(eq(appSecret.key, key))
    .get();
  return row?.value ?? null;
}

export function setSecret(key: string, value: string): void {
  db.insert(appSecret)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSecret.key, set: { value } })
    .run();
}

/** Read a secret, generating and persisting one if it does not exist yet. */
export function getOrCreateSecret(key: string, generate: () => string): string {
  const existing = getSecret(key);
  if (existing) return existing;

  const value = generate();
  setSecret(key, value);
  return value;
}

export function getSessionSecret(): string {
  return getOrCreateSecret(SECRET_KEYS.sessionSecret, () =>
    randomBytes(32).toString("base64url"),
  );
}
