import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";

import { db } from "@/db";
import { session, user } from "@/db/schema";
import { config } from "@/lib/config";
import type { UserRole } from "@/db/schema";

export const SESSION_COOKIE = "fp_session";

export type SessionUser = {
  id: string;
  householdId: string;
  email: string;
  displayName: string;
  role: UserRole;
  childId: string | null;
};

/**
 * Only the SHA-256 of the token is stored. A leaked database backup should not
 * hand someone live sessions.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  userAgent?: string,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + config.sessionTtlDays * 86_400_000;

  db.insert(session)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: userAgent ?? null,
    })
    .run();

  db.update(user)
    .set({ lastLoginAt: Date.now() })
    .where(eq(user.id, userId))
    .run();

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The app is intended to be served over HTTPS, but a first-run check on
    // http://<host>:3000 before TLS is wired up must still be able to log in.
    secure: config.isProduction && !!config.appUrl?.startsWith("https://"),
    path: "/",
    maxAge: config.sessionTtlDays * 86_400,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db
    .select({
      id: user.id,
      householdId: user.householdId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      childId: user.childId,
      active: user.active,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(
      and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, Date.now())),
    )
    .get();

  if (!row || !row.active) return null;

  const { active: _active, ...sessionUser } = row;
  return sessionUser;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    db.delete(session).where(eq(session.tokenHash, hashToken(token))).run();
  }
  store.delete(SESSION_COOKIE);
}

export function pruneExpiredSessions(): number {
  const result = db.delete(session).where(lt(session.expiresAt, Date.now())).run();
  return result.changes;
}
