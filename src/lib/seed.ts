import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { responsibility } from "@/db/schema";
import { AGE_PRESETS, bandForAge, type AgeBand } from "@/lib/age-presets";
import { adoptOrphans } from "@/lib/adopt";
import { todayInHousehold } from "@/lib/dates";

export { AGE_PRESETS, bandForAge };
export type { AgeBand };

/**
 * Starter content for a new household.
 *
 * Everything here is editable, renameable, and deletable. The point is that
 * nobody ever faces a blank configuration screen — SPEC §2.2 treats setup
 * burden as a real threat to the project, because an application that takes an
 * evening to configure is one you avoid on a Sunday night.
 */

/**
 * Fill a freshly created child with the age-band starter set: a handful of
 * responsibilities. This is the single change
 * that most affects how the app feels on day one — the alternative is a blank
 * form staring back at a parent who just wants to get started.
 *
 * Everything written here is a normal row a parent can edit or delete
 * afterward; this only exists to skip the blank-page moment.
 */
export function applyAgePreset(childId: string, householdId: string, band: AgeBand): void {
  const preset = AGE_PRESETS[band];
  const today = todayInHousehold();

  preset.responsibilities.forEach((r, index) => {
    db.insert(responsibility)
      .values({
        childId,
        name: r.name,
        weeklyValueCents: r.weeklyValueCents,
        cadence: r.cadence,
        maxOccurrences: "maxOccurrences" in r ? r.maxOccurrences : null,
        payMode: r.cadence === "up_to_n" ? "optional" : "expected",
        effectiveFrom: today,
        sortOrder: index,
      })
      .run();
  });

  // Attach them to the family list in Setup (by name, or as new entries
  // just for this child) so they're managed there like everything else.
  adoptOrphans(householdId);
}

/**
 * Start a new child from an existing sibling's setup instead of a preset.
 * Useful once the first child's responsibilities have already been tuned by
 * hand — the second child gets the same starting point rather than the
 * generic age band, and each can diverge from there.
 */
export function copyFromSibling(sourceChildId: string, targetChildId: string): void {
  const today = todayInHousehold();

  const sourceResponsibilities = db
    .select()
    .from(responsibility)
    .where(and(eq(responsibility.childId, sourceChildId), eq(responsibility.active, true)))
    .all();
  // The new child may already have the family-wide ones.
  const already = new Set(
    db
      .select({ t: responsibility.templateId })
      .from(responsibility)
      .where(eq(responsibility.childId, targetChildId))
      .all()
      .map((x) => x.t),
  );

  sourceResponsibilities
    .filter((r) => !r.templateId || !already.has(r.templateId))
    .forEach((r, index) => {
    db.insert(responsibility)
      .values({
        childId: targetChildId,
        templateId: r.templateId,
        syncedWithTemplate: r.syncedWithTemplate,
        name: r.name,
        icon: r.icon,
        weeklyValueCents: r.weeklyValueCents,
        cadence: r.cadence,
        daysOfWeek: r.daysOfWeek,
        maxOccurrences: r.maxOccurrences,
        payMode: r.payMode,
        allOrNothing: r.allOrNothing,
        effectiveFrom: today,
        sortOrder: index,
      })
      .run();
  });
}
