"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { household, user } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { createInvite } from "@/lib/invites";

export type ChildLoginState = { error?: string; ok?: boolean; url?: string };

/** Mint a magic link that lets this specific child create their own login. */
export async function inviteChild(
  _prev: ChildLoginState,
  formData: FormData,
): Promise<ChildLoginState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }

  const token = createInvite(parent.householdId, parent.id, { role: "child", childId });

  const home = db
    .select()
    .from(household)
    .where(eq(household.id, parent.householdId))
    .get();
  const base = home?.appUrl?.replace(/\/$/, "") ?? "";

  revalidatePath("/settings", "layout");
  return { ok: true, url: `${base}/invite/${token}` };
}

export async function deactivateChildLogin(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const userId = String(formData.get("userId") ?? "");
  db.update(user)
    .set({ active: false })
    .where(and(eq(user.id, userId), eq(user.householdId, parent.householdId), eq(user.role, "child")))
    .run();

  revalidatePath("/settings", "layout");
}

export async function reactivateChildLogin(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const userId = String(formData.get("userId") ?? "");
  db.update(user)
    .set({ active: true })
    .where(and(eq(user.id, userId), eq(user.householdId, parent.householdId), eq(user.role, "child")))
    .run();

  revalidatePath("/settings", "layout");
}
