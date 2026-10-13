/**
 * Age-band starter data: pure data and lookup, no database access.
 *
 * Split out from lib/seed.ts (which is server-only and touches the database)
 * so the add-child form — a client component — can read the preset labels and
 * responsibility counts to preview what "use an age preset" will add, without
 * pulling a server-only module into client code.
 */

export const AGE_PRESETS = {
  "5-7": {
    label: "Ages 5–7",
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
    responsibilities: [
      { name: "Make your bed", weeklyValueCents: 350, cadence: "daily" as const },
      { name: "Homework before screens", weeklyValueCents: 500, cadence: "daily" as const },
      { name: "Take out the trash", weeklyValueCents: 200, cadence: "weekly" as const },
      { name: "Feed the pet", weeklyValueCents: 350, cadence: "daily" as const },
    ],
  },
  "11-13": {
    label: "Ages 11–13",
    responsibilities: [
      { name: "Keep your room tidy", weeklyValueCents: 400, cadence: "weekly" as const },
      { name: "Homework done on time", weeklyValueCents: 700, cadence: "daily" as const },
      { name: "Dishes after dinner", weeklyValueCents: 500, cadence: "daily" as const },
      { name: "Clean a bathroom", weeklyValueCents: 500, cadence: "weekly" as const },
    ],
  },
  "14+": {
    label: "Ages 14 and up",
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
