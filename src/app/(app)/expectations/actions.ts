"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { houseRule, privilege, trustArea } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { joinArea, joinAreaForAllChildren, leaveArea } from "@/lib/trust";

export type RuleState = { error?: string; ok?: boolean };

/**
 * House rules must be observable.
 *
 * "Follow directions the first time" can be seen; "have a good attitude" cannot,
 * and a child cannot tell whether they met it. This warns rather than blocks —
 * a parent is always allowed to be wrong on purpose.
 */
const VAGUE_WORDS = ["attitude", "nice", "good", "respectful", "kind", "behave", "better"];

function vaguenessWarning(text: string): string | null {
  const lower = text.toLowerCase();
  const hit = VAGUE_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (!hit && lower.split(/\s+/).length > 2) return null;

  return hit
    ? `"${hit}" is hard for a child to measure. Something observable — "follow directions the first time" — works better, but this was saved as written.`
    : null;
}

export async function addArea(_prev: RuleState, formData: FormData): Promise<RuleState> {
  const parent = await requireParent();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name the area." };

  const count = db
    .select({ id: trustArea.id })
    .from(trustArea)
    .where(eq(trustArea.householdId, parent.householdId))
    .all().length;

  const created = db
    .insert(trustArea)
    .values({
      householdId: parent.householdId,
      name,
      icon: String(formData.get("icon") ?? "").trim() || null,
      sortOrder: count,
    })
    .returning({ id: trustArea.id })
    .get();

  // Applies to every current child by default, exactly like a new
  // responsibility does — the household-level thing exists to save
  // repeating this per child, not to start empty.
  joinAreaForAllChildren(parent.householdId, created.id);

  revalidatePath("/expectations");
  return { ok: true };
}

export async function editArea(_prev: RuleState, formData: FormData): Promise<RuleState> {
  await requireParent();
  const areaId = String(formData.get("areaId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name the area." };

  db.update(trustArea)
    .set({ name, icon: String(formData.get("icon") ?? "").trim() || null })
    .where(eq(trustArea.id, areaId))
    .run();

  revalidatePath("/expectations");
  return { ok: true };
}

export async function archiveArea(formData: FormData): Promise<void> {
  await requireParent();
  db.update(trustArea)
    .set({ active: false })
    .where(eq(trustArea.id, String(formData.get("areaId") ?? "")))
    .run();
  revalidatePath("/expectations");
}

/** Add/remove one child from one area — the "Edit area" membership toggle. */
export async function toggleAreaMembership(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const areaId = String(formData.get("areaId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const member = String(formData.get("member")) === "true";

  if (!getChild(parent.householdId, childId)) return;

  if (member) {
    leaveArea(areaId, childId);
  } else {
    joinArea(areaId, childId);
  }

  revalidatePath("/expectations");
}

export async function addRule(_prev: RuleState, formData: FormData): Promise<RuleState> {
  const parent = await requireParent();
  const text = String(formData.get("text") ?? "").trim();
  const trustAreaId = String(formData.get("trustAreaId") ?? "");
  const weight = Number(formData.get("defaultWeight") ?? 1);

  if (!text) return { error: "Write the rule." };
  if (!trustAreaId) return { error: "Pick an area." };

  db.insert(houseRule)
    .values({
      householdId: parent.householdId,
      trustAreaId,
      text,
      defaultWeight: Math.max(1, weight),
    })
    .run();

  revalidatePath("/expectations");

  const warning = vaguenessWarning(text);
  return warning ? { ok: true, error: warning } : { ok: true };
}

export async function editRule(_prev: RuleState, formData: FormData): Promise<RuleState> {
  await requireParent();
  const ruleId = String(formData.get("ruleId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const weight = Number(formData.get("defaultWeight") ?? 1);

  if (!text) return { error: "Write the rule." };

  db.update(houseRule)
    .set({ text, defaultWeight: Math.max(1, weight) })
    .where(eq(houseRule.id, ruleId))
    .run();

  revalidatePath("/expectations");

  const warning = vaguenessWarning(text);
  return warning ? { ok: true, error: warning } : { ok: true };
}

export async function archiveRule(formData: FormData): Promise<void> {
  await requireParent();
  db.update(houseRule)
    .set({ active: false })
    .where(eq(houseRule.id, String(formData.get("ruleId") ?? "")))
    .run();
  revalidatePath("/expectations");
}

export async function addPrivilege(
  _prev: RuleState,
  formData: FormData,
): Promise<RuleState> {
  const parent = await requireParent();
  const name = String(formData.get("name") ?? "").trim();
  const trustAreaId = String(formData.get("trustAreaId") ?? "");

  if (!name) return { error: "Name the privilege." };
  if (!trustAreaId) return { error: "Pick an area." };

  db.insert(privilege)
    .values({
      householdId: parent.householdId,
      trustAreaId,
      name,
      minLevel: Number(formData.get("minLevel") ?? 3),
    })
    .run();

  revalidatePath("/expectations");
  return { ok: true };
}

export async function editPrivilege(
  _prev: RuleState,
  formData: FormData,
): Promise<RuleState> {
  await requireParent();
  const privilegeId = String(formData.get("privilegeId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "Name the privilege." };

  db.update(privilege)
    .set({ name, minLevel: Number(formData.get("minLevel") ?? 3) })
    .where(eq(privilege.id, privilegeId))
    .run();

  revalidatePath("/expectations");
  return { ok: true };
}

export async function archivePrivilege(formData: FormData): Promise<void> {
  await requireParent();
  db.update(privilege)
    .set({ active: false })
    .where(eq(privilege.id, String(formData.get("privilegeId") ?? "")))
    .run();
  revalidatePath("/expectations");
}
