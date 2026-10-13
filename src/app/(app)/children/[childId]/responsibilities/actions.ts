"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { auditLog, completion, excusal, responsibility } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { parseAmountToCents } from "@/lib/money";
import { resolvePolicy } from "@/lib/policy";
import { parsePayFields, resyncResponsibility, toggleBox } from "@/lib/responsibilities";

export type RespState = { error?: string; ok?: boolean };

const EditSchema = z.object({
  responsibilityId: z.string().min(1),
  childId: z.string().min(1),
  weeklyValue: z.string().min(1, "Enter a weekly amount."),
  cadence: z.enum(["daily", "daily_selected", "weekly", "up_to_n"]),
  maxOccurrences: z.string().optional(),
  daysOfWeek: z.array(z.string()).optional(),
});

/**
 * A direct edit to one child's own copy — the "modify per child" half of a
 * family responsibility. If this row came from a template, editing it here
 * flips it out of sync, so a later template-wide edit leaves this one alone.
 */
export async function editResponsibility(
  _prev: RespState,
  formData: FormData,
): Promise<RespState> {
  const parent = await requireParent();

  const parsed = EditSchema.safeParse({
    responsibilityId: formData.get("responsibilityId"),
    childId: formData.get("childId"),
    weeklyValue: formData.get("weeklyValue"),
    cadence: formData.get("cadence"),
    maxOccurrences: formData.get("maxOccurrences") ?? undefined,
    daysOfWeek: formData.getAll("daysOfWeek").map(String),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  if (!getChild(parent.householdId, parsed.data.childId)) {
    return { error: "That child could not be found." };
  }

  const weeklyValueCents = parseAmountToCents(parsed.data.weeklyValue);
  if (weeklyValueCents === null || weeklyValueCents <= 0) {
    return { error: "Enter a positive weekly amount." };
  }

  const days = (parsed.data.daysOfWeek ?? []).map(Number).filter((n) => !Number.isNaN(n));
  if (parsed.data.cadence === "daily_selected" && days.length === 0) {
    return { error: "Choose at least one day." };
  }

  db.update(responsibility)
    .set({
      weeklyValueCents,
      cadence: parsed.data.cadence,
      daysOfWeek: parsed.data.cadence === "daily_selected" ? days : null,
      maxOccurrences:
        parsed.data.cadence === "up_to_n"
          ? Math.max(1, Number(parsed.data.maxOccurrences ?? 1))
          : null,
      ...parsePayFields(formData),
      syncedWithTemplate: false,
    })
    .where(
      and(
        eq(responsibility.id, parsed.data.responsibilityId),
        eq(responsibility.childId, parsed.data.childId),
      ),
    )
    .run();

  revalidatePath(`/children/${parsed.data.childId}/responsibilities`);
  revalidatePath("/responsibilities", "layout");
  return { ok: true };
}

/** Back to the family values for one child's copy of an expectation. */
export async function resyncChildResponsibility(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  if (!getChild(parent.householdId, childId)) return;
  resyncResponsibility(String(formData.get("responsibilityId") ?? ""));
  revalidatePath("/responsibilities", "layout");
  revalidatePath(`/children/${childId}/responsibilities`);
}

/**
 * A tap on one box of the week view. Returns the id of a miss it just
 * recorded so the caller can offer to attach a note.
 */
export async function tapBox(input: {
  childId: string;
  responsibilityId: string;
  date: string;
  weekEnd?: string;
  checked: boolean;
}): Promise<{ missId: string | null }> {
  const parent = await requireParent();
  if (!getChild(parent.householdId, input.childId)) return { missId: null };

  const result = toggleBox({
    ...input,
    parentId: parent.id,
    completionMode: resolvePolicy(parent.householdId, input.childId).completion.mode,
  });

  revalidatePath("/");
  revalidatePath("/expectations");
  revalidatePath(`/children/${input.childId}/responsibilities`);
  revalidatePath(`/children/${input.childId}/pay`);
  return result;
}

/** Attach (or clear) the note on a miss. */
export async function saveMissNote(input: {
  childId: string;
  missId: string;
  note: string;
}): Promise<void> {
  const parent = await requireParent();
  if (!getChild(parent.householdId, input.childId)) return;

  const note = input.note.trim().slice(0, 500);
  db.update(completion)
    .set({ note: note || null })
    .where(
      and(
        eq(completion.id, input.missId),
        eq(completion.childId, input.childId),
        eq(completion.status, "missed"),
      ),
    )
    .run();

  revalidatePath("/expectations");
  revalidatePath(`/children/${input.childId}/responsibilities`);
}

export async function addExcusal(
  _prev: RespState,
  formData: FormData,
): Promise<RespState> {
  const parent = await requireParent();

  const childId = String(formData.get("childId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }
  if (!startDate || !endDate) return { error: "Pick both dates." };
  if (endDate < startDate) return { error: "The end date is before the start date." };

  db.insert(excusal)
    .values({ childId, startDate, endDate, reason, scope: "all", createdByUserId: parent.id })
    .run();

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "excusal.created",
      entityType: "child",
      entityId: childId,
      afterJson: { startDate, endDate, reason },
    })
    .run();

  revalidatePath(`/children/${childId}/responsibilities`);
  return { ok: true };
}

/**
 * Apply a raise across responsibilities.
 *
 * Recorded in the audit log and surfaced in the child's history, because a raise
 * should be a visible event rather than a number that quietly changed.
 */
export async function applyRaise(
  _prev: RespState,
  formData: FormData,
): Promise<RespState> {
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

  revalidatePath(`/children/${childId}/responsibilities`);
  revalidatePath(`/children/${childId}/settings`);
  revalidatePath("/responsibilities", "layout");
  return { ok: true };
}
