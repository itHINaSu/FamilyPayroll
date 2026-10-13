"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { payPeriod, paystub } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { draftPaystub, postPaystub } from "@/lib/payroll";

export type PayState = { error?: string; ok?: string };

/**
 * Draft this period early.
 *
 * Payroll drafts and posts itself on schedule; this exists so a parent can see
 * the numbers before the deadline, not because anything requires them to act.
 */
export async function draftNow(
  _prev: PayState,
  formData: FormData,
): Promise<PayState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }

  try {
    draftPaystub(
      parent.householdId,
      childId,
      String(formData.get("startDate")),
      String(formData.get("endDate")),
      String(formData.get("payDate")),
      parent.id,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not draft." };
  }

  revalidatePath("/", "layout");
  return { ok: "Draft ready." };
}

/** Post a draft before its pay date. The scheduler would do this anyway. */
export async function postNow(
  _prev: PayState,
  formData: FormData,
): Promise<PayState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }

  const draft = db
    .select({ stub: paystub })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .where(and(eq(paystub.childId, childId), eq(paystub.status, "draft")))
    .get();

  if (!draft) return { error: "There is no draft waiting to be posted." };

  try {
    postPaystub(draft.stub.id, parent.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not post." };
  }

  revalidatePath("/", "layout");
  return { ok: "Posted." };
}
