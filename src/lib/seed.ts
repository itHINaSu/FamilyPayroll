import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  houseRule,
  privilege,
  responsibility,
  trustArea,
  trustAreaOverride,
} from "@/db/schema";
import { AGE_PRESETS, bandForAge, type AgeBand } from "@/lib/age-presets";
import { todayInHousehold } from "@/lib/dates";
import { DEFAULT_AREAS, DEFAULT_HOUSE_RULES } from "@/lib/trust";

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

const DEFAULT_PRIVILEGES: { area: string; name: string; minLevel: number }[] = [
  { area: "Screens", name: "Tablet or TV time", minLevel: 3 },
  { area: "Screens", name: "Pick the movie", minLevel: 3 },
  { area: "Home", name: "Legos and quiet play", minLevel: 1 },
  { area: "Home", name: "Stay up a bit later on Friday", minLevel: 3 },
  { area: "Home", name: "Dessert after dinner", minLevel: 2 },
  { area: "Friendships", name: "Have a friend over", minLevel: 3 },
  { area: "Out & About", name: "Ride to the park", minLevel: 2 },
  { area: "Out & About", name: "Go on a special outing", minLevel: 3 },
];

export function seedHousehold(householdId: string): void {
  const existing = db
    .select({ id: trustArea.id })
    .from(trustArea)
    .where(eq(trustArea.householdId, householdId))
    .get();
  if (existing) return; // already seeded

  const areaIds = new Map<string, string>();

  DEFAULT_AREAS.forEach((area, index) => {
    const row = db
      .insert(trustArea)
      .values({
        householdId,
        name: area.name,
        icon: area.icon,
        sortOrder: index,
      })
      .returning({ id: trustArea.id })
      .get();
    areaIds.set(area.name, row.id);
  });

  for (const [areaName, rules] of Object.entries(DEFAULT_HOUSE_RULES)) {
    const areaId = areaIds.get(areaName);
    if (!areaId) continue;

    rules.forEach((rule, index) => {
      db.insert(houseRule)
        .values({
          householdId,
          trustAreaId: areaId,
          text: rule.text,
          defaultWeight: rule.weight,
          sortOrder: index,
        })
        .run();
    });
  }

  DEFAULT_PRIVILEGES.forEach((p, index) => {
    const areaId = areaIds.get(p.area);
    if (!areaId) return;

    db.insert(privilege)
      .values({
        householdId,
        trustAreaId: areaId,
        name: p.name,
        minLevel: p.minLevel,
        sortOrder: index,
      })
      .run();
  });
}

/**
 * Fill a freshly created child with the age-band starter set: a handful of
 * responsibilities and matching trust drain/cap. This is the single change
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

  // A per-child override for every active trust area, so a seven-year-old and
  // a fifteen-year-old sibling recover at different speeds from day one
  // (SPEC §12.9's age-preset table) rather than sharing the household default.
  const areas = db
    .select({ id: trustArea.id })
    .from(trustArea)
    .where(and(eq(trustArea.householdId, householdId), eq(trustArea.active, true)))
    .all();

  for (const area of areas) {
    db.insert(trustAreaOverride)
      .values({
        childId,
        trustAreaId: area.id,
        drainAmount: preset.trust.drainAmount,
        drainIntervalHours: preset.trust.drainIntervalHours,
        capLoad: preset.trust.capLoad,
      })
      .run();
  }
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

  sourceResponsibilities.forEach((r, index) => {
    db.insert(responsibility)
      .values({
        childId: targetChildId,
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

  const sourceOverrides = db
    .select()
    .from(trustAreaOverride)
    .where(eq(trustAreaOverride.childId, sourceChildId))
    .all();

  for (const o of sourceOverrides) {
    db.insert(trustAreaOverride)
      .values({
        childId: targetChildId,
        trustAreaId: o.trustAreaId,
        drainAmount: o.drainAmount,
        drainIntervalHours: o.drainIntervalHours,
        capLoad: o.capLoad,
      })
      .run();
  }
}
