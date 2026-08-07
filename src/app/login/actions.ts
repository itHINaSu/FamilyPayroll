"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  clearMfaChallenge,
  createMfaChallenge,
  createSession,
  destroySession,
  getMfaChallengeUserId,
} from "@/lib/auth/session";
import { verifyTotp } from "@/lib/auth/totp";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export type LoginState = { error?: string; mfaRequired?: boolean };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter your username and password." };
  }

  const found = db
    .select()
    .from(user)
    .where(eq(user.email, parsed.data.email))
    .get();

  // One message for both "no such account" and "wrong password", so the form
  // cannot be used to discover which usernames exist.
  const invalid = { error: "Username or password is incorrect." };

  if (!found || !found.active) return invalid;
  if (!(await verifyPassword(parsed.data.password, found.passwordHash))) {
    return invalid;
  }

  if (found.totpEnabledAt) {
    await createMfaChallenge(found.id);
    return { mfaRequired: true };
  }

  await createSession(found.id);
  redirect("/");
}

export type MfaLoginState = { error?: string };

/**
 * The second step for an account with 2FA on. Accepts either a fresh
 * six-digit TOTP code or one of the one-time recovery codes issued at
 * enrollment — the latter is what makes 2FA safe to turn on for a
 * self-hosted app with no "email support" fallback if a phone is lost.
 */
export async function verifyMfaLogin(
  _prev: MfaLoginState,
  formData: FormData,
): Promise<MfaLoginState> {
  const userId = await getMfaChallengeUserId();
  if (!userId) {
    return { error: "That took too long. Sign in again." };
  }

  const found = db.select().from(user).where(eq(user.id, userId)).get();
  if (!found || !found.active || !found.totpSecret) {
    await clearMfaChallenge();
    return { error: "Sign in again." };
  }

  const code = String(formData.get("otp") ?? "").trim();
  if (!code) return { error: "Enter a code." };

  let verified = verifyTotp(found.totpSecret, code);

  if (!verified) {
    const codes = found.totpRecoveryCodesJson ?? [];
    const normalized = code.toUpperCase();

    for (let i = 0; i < codes.length; i++) {
      if (codes[i].usedAt) continue;
      if (await verifyPassword(normalized, codes[i].hash)) {
        const next = codes.map((c, idx) => (idx === i ? { ...c, usedAt: Date.now() } : c));
        db.update(user)
          .set({ totpRecoveryCodesJson: next })
          .where(eq(user.id, userId))
          .run();
        verified = true;
        break;
      }
    }
  }

  if (!verified) return { error: "That code is incorrect." };

  await clearMfaChallenge();
  await createSession(userId);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
