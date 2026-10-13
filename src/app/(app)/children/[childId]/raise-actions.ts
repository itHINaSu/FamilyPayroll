"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, responsibility } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";

export type RaiseState = { error?: string; ok?: boolean };

/**
 * Apply a raise across responsibilities.
 *
 * Recorded in the audit log and surfaced in the child's history, because a raise
 * should be a visible event rather than a number that quietly changed.
 */
export async function applyRaise(
  _prev: RaiseState,
  formData: FormData,
): Promise<RaiseState> {
  const parent = await requireParent();

  const childId = String(formData.get("childId") ?? "");
  const mode = String(formData.get("mode") ?? "percent");
  const value = Number(formData.get("value") ?? 0);
  const selected = formData.getAll("responsibilityIds").map(String);

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "Enter a positive raise." };
  }

  const targets = db
    .select()
    .from(responsibility)
    .where(and(eq(responsibility.childId, childId), eq(responsibility.active, true)))
    .all()
    .filter((r) => selected.length === 0 || selected.includes(r.id));

  for (const r of targets) {
    const next =
      mode === "percent"
        ? Math.round(r.weeklyValueCents * (1 + value / 100))
        : r.weeklyValueCents + Math.round(value * 100);

    db.update(responsibility)
      .set({ weeklyValueCents: next })
      .where(eq(responsibility.id, r.id))
      .run();
  }

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "raise.applied",
      entityType: "child",
      entityId: childId,
      afterJson: { mode, value, count: targets.length },
    })
    .run();

  revalidatePath("/", "layout");
  return { ok: true };
}
