"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { houseRule, privilege, trustArea } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";

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

  db.insert(trustArea)
    .values({
      householdId: parent.householdId,
      name,
      icon: String(formData.get("icon") ?? "").trim() || null,
      sortOrder: count,
    })
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

export async function archivePrivilege(formData: FormData): Promise<void> {
  await requireParent();
  db.update(privilege)
    .set({ active: false })
    .where(eq(privilege.id, String(formData.get("privilegeId") ?? "")))
    .run();
  revalidatePath("/expectations");
}
