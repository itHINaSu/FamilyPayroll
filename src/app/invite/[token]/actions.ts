"use server";

import { redirect } from "next/navigation";

import { createSession } from "@/lib/auth/session";
import { redeemInvite } from "@/lib/invites";

export type AcceptInviteState = { error?: string };

export async function acceptInvite(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await redeemInvite(token, { displayName, username, password });
  if (!result.ok) return { error: result.error };

  await createSession(result.userId);
  redirect(result.role === "child" ? "/me" : "/");
}
