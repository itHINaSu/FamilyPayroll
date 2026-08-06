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

export type RespState = { error?: string; ok?: boolean };

const ResponsibilitySchema = z.object({
  childId: z.string().min(1),
  name: z.string().trim().min(1, "Give it a name."),
  weeklyValue: z.string().min(1, "Enter a weekly amount."),
  cadence: z.enum(["daily", "daily_selected", "weekly", "up_to_n"]),
  maxOccurrences: z.string().optional(),
  daysOfWeek: z.array(z.string()).optional(),
});

export async function addResponsibility(
  _prev: RespState,
  formData: FormData,
): Promise<RespState> {
  const parent = await requireParent();

  const parsed = ResponsibilitySchema.safeParse({
    childId: formData.get("childId"),
    name: formData.get("name"),
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

  const maxOccurrences =
    parsed.data.cadence === "up_to_n"
      ? Math.max(1, Number(parsed.data.maxOccurrences ?? 1))
      : null;

  db.insert(responsibility)
    .values({
      childId: parsed.data.childId,
      name: parsed.data.name,
      weeklyValueCents,
      cadence: parsed.data.cadence,
      daysOfWeek: parsed.data.cadence === "daily_selected" ? days : null,
      maxOccurrences,
      effectiveFrom: new Date().toLocaleDateString("en-CA"),
    })
    .run();

  revalidatePath(`/children/${parsed.data.childId}/responsibilities`);
  return { ok: true };
}

export async function archiveResponsibility(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const id = String(formData.get("responsibilityId") ?? "");
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  // Archived rather than deleted: past pay stubs reference it by name and id.
  db.update(responsibility)
    .set({ active: false, archivedAt: Date.now() })
    .where(eq(responsibility.id, id))
    .run();

  revalidatePath(`/children/${childId}/responsibilities`);
}

/**
 * Mark a day done or undone.
 *
 * Under the default completion mode a claim stands unless a parent objects
 * before the stub posts, so toggling here is the whole interaction.
 */
export async function toggleCompletion(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const responsibilityId = String(formData.get("responsibilityId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const date = String(formData.get("date") ?? "");

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
    .get();

  if (existing) {
    db.delete(completion).where(eq(completion.id, existing.id)).run();
  } else {
    const policy = resolvePolicy(parent.householdId, childId);
    db.insert(completion)
      .values({
        responsibilityId,
        childId,
        occurrenceDate: date,
        // In auto-approve mode a claim counts immediately; otherwise a parent
        // marking it is itself the approval.
        status: policy.completion.mode === "parent_marks_only" ? "approved" : "claimed",
        claimedByUserId: parent.id,
        decidedByUserId:
          policy.completion.mode === "parent_marks_only" ? parent.id : null,
      })
      .run();
  }

  revalidatePath(`/children/${childId}/responsibilities`);
  revalidatePath(`/children/${childId}/pay`);
}

/** An extra tick for an up-to-N responsibility, which allows several a day. */
export async function addOccurrence(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const responsibilityId = String(formData.get("responsibilityId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const date = String(formData.get("date") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  const sameDay = db
    .select()
    .from(completion)
    .where(
      and(
        eq(completion.responsibilityId, responsibilityId),
        eq(completion.occurrenceDate, date),
      ),
    )
    .all();

  db.insert(completion)
    .values({
      responsibilityId,
      childId,
      occurrenceDate: date,
      occurrenceIndex: sameDay.length,
      status: "claimed",
      claimedByUserId: parent.id,
    })
    .run();

  revalidatePath(`/children/${childId}/responsibilities`);
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
  return { ok: true };
}
