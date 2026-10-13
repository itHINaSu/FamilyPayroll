"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { goal } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { earmark, spendGoal, unearmark } from "@/lib/goals";
import { storeImage, ACCEPTED_UPLOAD_TYPES } from "@/lib/images";
import { LedgerError } from "@/lib/ledger";
import { parseAmountToCents } from "@/lib/money";

export type GoalState = { error?: string; ok?: boolean };

const GoalSchema = z.object({
  childId: z.string().min(1),
  name: z.string().trim().min(1, "Name the goal."),
  target: z.string().min(1, "Enter a target."),
});

export async function addGoal(_prev: GoalState, formData: FormData): Promise<GoalState> {
  const parent = await requireParent();

  const parsed = GoalSchema.safeParse({
    childId: formData.get("childId"),
    name: formData.get("name"),
    target: formData.get("target"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  if (!getChild(parent.householdId, parsed.data.childId)) {
    return { error: "That child could not be found." };
  }

  const targetCents = parseAmountToCents(parsed.data.target);
  if (targetCents === null || targetCents <= 0) {
    return { error: "Enter a positive target." };
  }

  let photoBlobId: string | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
      return { error: "That file type is not a supported image." };
    }
    photoBlobId = await storeImage(
      parent.householdId,
      Buffer.from(await file.arrayBuffer()),
      "goal",
    );
  }

  db.insert(goal)
    .values({
      childId: parsed.data.childId,
      name: parsed.data.name,
      targetCents,
      photoBlobId,
    })
    .run();

  revalidatePath(`/balances/${parsed.data.childId}`, "layout");
  return { ok: true };
}

export async function moveGoalMoney(
  _prev: GoalState,
  formData: FormData,
): Promise<GoalState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  const goalId = String(formData.get("goalId") ?? "");
  const direction = String(formData.get("direction") ?? "in");

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }

  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter a positive amount." };
  }

  try {
    if (direction === "in") {
      earmark(childId, goalId, amountCents, parent.id);
    } else {
      unearmark(childId, goalId, amountCents, parent.id);
    }
  } catch (error) {
    if (error instanceof LedgerError) return { error: error.message };
    throw error;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function buyGoal(_prev: GoalState, formData: FormData): Promise<GoalState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  const goalId = String(formData.get("goalId") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }

  try {
    spendGoal(childId, goalId, description || "Goal purchased", parent.id);
  } catch (error) {
    if (error instanceof LedgerError) return { error: error.message };
    throw error;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelGoal(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  const goalId = String(formData.get("goalId") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  // Return anything set aside before closing the goal, so money is never
  // stranded in a bucket nobody can see.
  const { goalBalance } = await import("@/lib/goals");
  const saved = goalBalance(goalId);
  if (saved > 0) unearmark(childId, goalId, saved, parent.id);

  db.update(goal).set({ status: "cancelled" }).where(eq(goal.id, goalId)).run();

  revalidatePath("/", "layout");
}
