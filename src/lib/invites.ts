import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { invite, user, type UserRole } from "@/db/schema";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { UsernameSchema } from "@/lib/auth/username";

const INVITE_TTL_MS = 7 * 86_400_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mints a one-time invite link. Only the hash is ever stored.
 *
 * `childId` is required for role='child' and ignored for role='parent' — it
 * is what ties the eventual login to one child's own record, the same way
 * `user.childId` does once the invite is redeemed.
 */
export function createInvite(
  householdId: string,
  createdByUserId: string,
  options: { role: UserRole; childId?: string },
): string {
  const token = randomBytes(24).toString("base64url");

  db.insert(invite)
    .values({
      householdId,
      role: options.role,
      childId: options.role === "child" ? (options.childId ?? null) : null,
      tokenHash: hashToken(token),
      createdByUserId,
      expiresAt: Date.now() + INVITE_TTL_MS,
    })
    .run();

  return token;
}

/** Unused, unexpired invites for a household — what Settings shows as pending. */
export function listPendingInvites(householdId: string, role?: UserRole) {
  return db
    .select()
    .from(invite)
    .where(
      role
        ? and(eq(invite.householdId, householdId), eq(invite.role, role), isNull(invite.usedAt))
        : and(eq(invite.householdId, householdId), isNull(invite.usedAt)),
    )
    .all()
    .filter((i) => i.expiresAt > Date.now());
}

/** Pending invites for one specific child — a settings page checks this. */
export function pendingInviteForChild(childId: string) {
  return db
    .select()
    .from(invite)
    .where(and(eq(invite.childId, childId), eq(invite.role, "child"), isNull(invite.usedAt)))
    .all()
    .find((i) => i.expiresAt > Date.now());
}

export function revokeInvite(householdId: string, inviteId: string): void {
  db.delete(invite)
    .where(and(eq(invite.id, inviteId), eq(invite.householdId, householdId)))
    .run();
}

export type InviteLookup =
  | { valid: true; householdId: string; role: UserRole; childId: string | null }
  | { valid: false; reason: "not_found" | "used" | "expired" };

export function lookupInvite(token: string): InviteLookup {
  const row = db.select().from(invite).where(eq(invite.tokenHash, hashToken(token))).get();

  if (!row) return { valid: false, reason: "not_found" };
  if (row.usedAt) return { valid: false, reason: "used" };
  if (row.expiresAt < Date.now()) return { valid: false, reason: "expired" };
  return { valid: true, householdId: row.householdId, role: row.role, childId: row.childId };
}

export type RedeemResult =
  | { ok: true; userId: string; role: UserRole }
  | { ok: false; error: string };

/**
 * Turns a valid invite into a real login — parent or child. The household
 * (and, for a child, the childId) come from the invite itself, never from
 * anything the invitee types, which is what closes off the obvious way this
 * could be abused to join an arbitrary household or attach to the wrong
 * child.
 */
export async function redeemInvite(
  token: string,
  input: { displayName: string; username: string; password: string },
): Promise<RedeemResult> {
  const row = db.select().from(invite).where(eq(invite.tokenHash, hashToken(token))).get();

  if (!row || row.usedAt || row.expiresAt < Date.now()) {
    return { ok: false, error: "That invite link is invalid or has expired." };
  }

  const displayName = input.displayName.trim();
  if (!displayName) return { ok: false, error: "Enter your name." };

  const parsedUsername = UsernameSchema.safeParse(input.username);
  if (!parsedUsername.success) {
    return { ok: false, error: parsedUsername.error.issues[0]?.message ?? "Check the username." };
  }

  const clash = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, parsedUsername.data))
    .get();
  if (clash) return { ok: false, error: "That username is already taken." };

  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const passwordHash = await hashPassword(input.password);

  const createdUserId = db.transaction((tx) => {
    const created = tx
      .insert(user)
      .values({
        householdId: row.householdId,
        email: parsedUsername.data,
        passwordHash,
        displayName,
        role: row.role,
        childId: row.role === "child" ? row.childId : null,
      })
      .returning({ id: user.id })
      .get();

    tx.update(invite)
      .set({ usedAt: Date.now(), usedByUserId: created.id })
      .where(eq(invite.id, row.id))
      .run();

    return created.id;
  });

  return { ok: true, userId: createdUserId, role: row.role };
}
