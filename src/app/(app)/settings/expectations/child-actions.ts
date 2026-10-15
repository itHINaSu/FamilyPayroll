"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { responsibility } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { parseAmountToCents } from "@/lib/money";
import { parsePayFields, resyncResponsibility } from "@/lib/responsibilities";

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

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Back to the family values for one child's copy of an expectation. */
export async function resyncChildResponsibility(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  if (!getChild(parent.householdId, childId)) return;
  resyncResponsibility(String(formData.get("responsibilityId") ?? ""));
  revalidatePath("/", "layout");
}

