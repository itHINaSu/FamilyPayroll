"use server";

import { revalidatePath } from "next/cache";

import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { pinLevel, recordMark, retractMark, setFocusNote } from "@/lib/trust";

export type TrustState = { error?: string; ok?: boolean };

/**
 * Record a mark. Invariant I10: nothing here writes a ledger entry or alters a
 * balance. Trust governs what a child is trusted with, never what they are paid.
 */
export async function addMark(
  _prev: TrustState,
  formData: FormData,
): Promise<TrustState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  const trustAreaId = String(formData.get("trustAreaId") ?? "");
  const houseRuleId = String(formData.get("houseRuleId") ?? "") || null;
  const weight = Number(formData.get("weight") ?? 0);
  const note = String(formData.get("note") ?? "").trim();

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }
  if (!trustAreaId) return { error: "Pick an area." };
  if (!Number.isFinite(weight) || weight === 0) {
    return { error: "A mark needs a weight." };
  }

  recordMark({
    childId,
    trustAreaId,
    houseRuleId,
    weight,
    note: note || null,
    createdByUserId: parent.id,
  });

  revalidatePath(`/children/${childId}/trust`);
  return { ok: true };
}

/**
 * Retract a mark outright — deliberately unlike the ledger. This is a parenting
 * tool, not a financial record; a parent who marked something in anger must be
 * able to undo it cleanly.
 */
export async function undoMark(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  if (!getChild(parent.householdId, childId)) return;

  retractMark(String(formData.get("markId") ?? ""));
  revalidatePath(`/children/${childId}/trust`);
}

export async function setPin(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  if (!getChild(parent.householdId, childId)) return;

  const raw = String(formData.get("level") ?? "");
  pinLevel(
    childId,
    String(formData.get("trustAreaId") ?? ""),
    raw === "" ? null : Number(raw),
    Number(formData.get("expiresInHours") ?? 24),
  );

  revalidatePath(`/children/${childId}/trust`);
}

export async function saveFocusNote(
  _prev: TrustState,
  formData: FormData,
): Promise<TrustState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }

  setFocusNote(childId, String(formData.get("text") ?? ""), parent.id);
  revalidatePath(`/children/${childId}/trust`);
  return { ok: true };
}
