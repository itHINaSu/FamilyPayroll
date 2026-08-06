"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { completion } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { resolvePolicy } from "@/lib/policy";

/**
 * Tick a responsibility from the daily view.
 *
 * Same operation as the per-child grid, but revalidating the dashboard too —
 * this is the path that will actually get used on a weeknight.
 */
export async function tickToday(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const responsibilityId = String(formData.get("responsibilityId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const date = String(formData.get("date") ?? "");
  const repeatable = String(formData.get("repeatable") ?? "") === "true";

  if (!getChild(parent.householdId, childId)) return;

  const existing = db
    .select()
    .from(completion)
    .where(
      and(
        eq(completion.responsibilityId, responsibilityId),
        eq(completion.occurrenceDate, date),
      ),
    )
    .all();

  // "Up to N" counts up rather than toggling, since several a day is the point.
  if (repeatable) {
    db.insert(completion)
      .values({
        responsibilityId,
        childId,
        occurrenceDate: date,
        occurrenceIndex: existing.length,
        status: "claimed",
        claimedByUserId: parent.id,
      })
      .run();
  } else if (existing.length > 0) {
    db.delete(completion).where(eq(completion.id, existing[0].id)).run();
  } else {
    const policy = resolvePolicy(parent.householdId, childId);
    db.insert(completion)
      .values({
        responsibilityId,
        childId,
        occurrenceDate: date,
        status: policy.completion.mode === "parent_marks_only" ? "approved" : "claimed",
        claimedByUserId: parent.id,
        decidedByUserId:
          policy.completion.mode === "parent_marks_only" ? parent.id : null,
      })
      .run();
  }

  revalidatePath("/");
  revalidatePath(`/children/${childId}/responsibilities`);
  revalidatePath(`/children/${childId}/pay`);
}

/** Undo the most recent tick of a repeatable responsibility. */
export async function untickToday(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const responsibilityId = String(formData.get("responsibilityId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const date = String(formData.get("date") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  const rows = db
    .select()
    .from(completion)
    .where(
      and(
        eq(completion.responsibilityId, responsibilityId),
        eq(completion.occurrenceDate, date),
      ),
    )
    .all();

  const last = rows.sort((a, b) => b.occurrenceIndex - a.occurrenceIndex)[0];
  if (last) db.delete(completion).where(eq(completion.id, last.id)).run();

  revalidatePath("/");
  revalidatePath(`/children/${childId}/responsibilities`);
}
