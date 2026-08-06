import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  completion,
  excusal,
  responsibility,
  type Cadence,
  type CompletionStatus,
} from "@/db/schema";
import { dayOfWeek, eachDate, type IsoDate } from "@/lib/dates";
import { earnedForResponsibility, scaleWeeklyValue } from "@/lib/money";

/**
 * Responsibilities: the paid tier (SPEC §4.4).
 *
 * A responsibility states a **weekly** value and a cadence. How many chances
 * that produces in a period, and what a partial week is worth, is computed here.
 */

export type ResponsibilityRow = typeof responsibility.$inferSelect;

/**
 * The dates in a period on which this responsibility can be completed.
 *
 * `up_to_n` is the odd one: its chances are a count rather than a set of dates,
 * because "vacuum up to three times" does not care which days.
 */
export function occurrenceDates(
  r: ResponsibilityRow,
  start: IsoDate,
  end: IsoDate,
): IsoDate[] {
  const days = eachDate(start, end);

  switch (r.cadence) {
    case "daily":
      return days;
    case "daily_selected": {
      const selected = new Set(r.daysOfWeek ?? []);
      return days.filter((d) => selected.has(dayOfWeek(d)));
    }
    case "weekly":
      return [start];
    case "up_to_n":
      return days; // any day is eligible; the cap limits the count
  }
}

export function chancesInPeriod(
  r: ResponsibilityRow,
  start: IsoDate,
  end: IsoDate,
): number {
  if (r.cadence === "up_to_n") {
    const weeks = Math.max(1, Math.round((eachDate(start, end).length / 7) * 10) / 10);
    return Math.max(1, Math.round((r.maxOccurrences ?? 1) * weeks));
  }
  if (r.cadence === "weekly") {
    return Math.max(1, Math.round(eachDate(start, end).length / 7));
  }
  return occurrenceDates(r, start, end).length;
}

/** Dates covered by an excusal, for this responsibility, within the period. */
export function excusedDates(
  childId: string,
  responsibilityId: string,
  start: IsoDate,
  end: IsoDate,
): Set<IsoDate> {
  const rows = db
    .select()
    .from(excusal)
    .where(and(eq(excusal.childId, childId), lte(excusal.startDate, end), gte(excusal.endDate, start)))
    .all();

  const covered = new Set<IsoDate>();
  for (const row of rows) {
    if (row.scope === "selected" && !(row.responsibilityIds ?? []).includes(responsibilityId)) {
      continue;
    }
    const from = row.startDate > start ? row.startDate : start;
    const to = row.endDate < end ? row.endDate : end;
    for (const d of eachDate(from, to)) covered.add(d);
  }
  return covered;
}

export type PeriodResult = {
  responsibility: ResponsibilityRow;
  chances: number;
  excused: number;
  completed: number;
  potentialCents: number;
  earnedCents: number;
};

/**
 * What a responsibility is worth over a period, and what was actually earned.
 *
 * Excused occurrences come out of the denominator rather than counting as
 * misses (invariant I8), so a week away at grandparents lowers potential pay and
 * leaves earned pay looking exactly as good as it was.
 */
export function evaluatePeriod(
  r: ResponsibilityRow,
  childId: string,
  start: IsoDate,
  end: IsoDate,
  completionMode: "auto_approve_with_veto" | "claim_then_approve" | "parent_marks_only",
): PeriodResult {
  const periodDays = eachDate(start, end).length;
  const scaledValue = scaleWeeklyValue(r.weeklyValueCents, periodDays);

  const rawChances = chancesInPeriod(r, start, end);

  const excusedSet =
    r.cadence === "up_to_n" ? new Set<IsoDate>() : excusedDates(childId, r.id, start, end);
  const excusedCount =
    r.cadence === "up_to_n"
      ? 0
      : occurrenceDates(r, start, end).filter((d) => excusedSet.has(d)).length;

  const chances = Math.max(0, rawChances - excusedCount);

  // Excusals shrink the opportunity, so potential shrinks with them (I8).
  const potentialCents =
    rawChances === 0 ? 0 : Math.round((scaledValue * chances) / rawChances);

  const rows = db
    .select()
    .from(completion)
    .where(
      and(
        eq(completion.responsibilityId, r.id),
        gte(completion.occurrenceDate, start),
        lte(completion.occurrenceDate, end),
      ),
    )
    .all();

  const countsAsDone = (status: CompletionStatus) =>
    completionMode === "auto_approve_with_veto"
      ? status === "claimed" || status === "approved"
      : status === "approved";

  const completed = rows.filter((c) => countsAsDone(c.status)).length;

  return {
    responsibility: r,
    chances,
    excused: excusedCount,
    completed: Math.min(completed, chances),
    potentialCents,
    earnedCents: earnedForResponsibility(potentialCents, completed, chances),
  };
}

export function listResponsibilities(childId: string, activeOnly = true) {
  const where = activeOnly
    ? and(eq(responsibility.childId, childId), eq(responsibility.active, true))
    : eq(responsibility.childId, childId);

  return db
    .select()
    .from(responsibility)
    .where(where)
    .orderBy(responsibility.sortOrder, responsibility.name)
    .all();
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Every day",
  daily_selected: "Certain days",
  weekly: "Once a week",
  up_to_n: "Up to N times",
};

export function describeCadence(r: ResponsibilityRow): string {
  switch (r.cadence) {
    case "daily":
      return "Every day";
    case "daily_selected": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return (r.daysOfWeek ?? []).map((d) => names[d]).join(", ") || "No days chosen";
    }
    case "weekly":
      return "Once a week";
    case "up_to_n":
      return `Up to ${r.maxOccurrences ?? 1}× a week`;
  }
}
