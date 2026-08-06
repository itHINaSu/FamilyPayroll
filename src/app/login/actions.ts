"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const found = db
    .select()
    .from(user)
    .where(eq(user.email, parsed.data.email))
    .get();

  // One message for both "no such account" and "wrong password", so the form
  // cannot be used to discover which emails exist.
  const invalid = { error: "Email or password is incorrect." };

  if (!found || !found.active) return invalid;
  if (!(await verifyPassword(parsed.data.password, found.passwordHash))) {
    return invalid;
  }

  await createSession(found.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
