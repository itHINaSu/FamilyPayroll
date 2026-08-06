import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { houseRule, privilege, trustArea } from "@/db/schema";
import { DEFAULT_AREAS, DEFAULT_HOUSE_RULES } from "@/lib/trust";

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
 * Age-band starter responsibilities, offered when a child is created.
 *
 * Values are weekly. The bands move both the money and the trust settings
 * together, since a seven-year-old and a fifteen-year-old need different
 * amounts of everything.
 */
export const AGE_PRESETS = {
  "5-7": {
    label: "Ages 5–7",
    trust: { drainAmount: 2, drainIntervalHours: 12, capLoad: 6 },
    responsibilities: [
      { name: "Make your bed", weeklyValueCents: 350, cadence: "daily" as const },
      { name: "Clear your plate", weeklyValueCents: 350, cadence: "daily" as const },
      { name: "Put away your laundry", weeklyValueCents: 200, cadence: "weekly" as const },
      {
        name: "Tidy the playroom",
        weeklyValueCents: 300,
        cadence: "up_to_n" as const,
        maxOccurrences: 3,
      },
    ],
  },
  "8-10": {
    label: "Ages 8–10",
    trust: { drainAmount: 2, drainIntervalHours: 24, capLoad: 8 },
    responsibilities: [
      { name: "Make your bed", weeklyValueCents: 350, cadence: "daily" as const },
      { name: "Homework before screens", weeklyValueCents: 500, cadence: "daily" as const },
      { name: "Take out the trash", weeklyValueCents: 200, cadence: "weekly" as const },
      { name: "Feed the pet", weeklyValueCents: 350, cadence: "daily" as const },
    ],
  },
  "11-13": {
    label: "Ages 11–13",
    trust: { drainAmount: 1, drainIntervalHours: 24, capLoad: 10 },
    responsibilities: [
      { name: "Keep your room tidy", weeklyValueCents: 400, cadence: "weekly" as const },
      { name: "Homework done on time", weeklyValueCents: 700, cadence: "daily" as const },
      { name: "Dishes after dinner", weeklyValueCents: 500, cadence: "daily" as const },
      { name: "Clean a bathroom", weeklyValueCents: 500, cadence: "weekly" as const },
    ],
  },
  "14+": {
    label: "Ages 14 and up",
    trust: { drainAmount: 1, drainIntervalHours: 24, capLoad: 14 },
    responsibilities: [
      { name: "Keep your room tidy", weeklyValueCents: 500, cadence: "weekly" as const },
      { name: "Dishes after dinner", weeklyValueCents: 700, cadence: "daily" as const },
      { name: "Laundry, start to finish", weeklyValueCents: 600, cadence: "weekly" as const },
      { name: "Mow the lawn", weeklyValueCents: 800, cadence: "weekly" as const },
    ],
  },
} as const;

export type AgeBand = keyof typeof AGE_PRESETS;

export function bandForAge(age: number): AgeBand {
  if (age <= 7) return "5-7";
  if (age <= 10) return "8-10";
  if (age <= 13) return "11-13";
  return "14+";
}
