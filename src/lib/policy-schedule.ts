import "server-only";

import { addDays, payPeriodFor } from "@/lib/dates";
import { resolvePolicy, scheduledVersionDates } from "@/lib/policy";
import { SETTINGS_SECTIONS, getAtPath, type FieldSpec } from "@/lib/settings-schema";

/** This pay period and when the next one starts, for the "when should this start?" prompt. */
export type PeriodChoice = { startDate: string; endDate: string; payDate: string; nextStart: string };

export function periodChoice(householdId: string, childId: string | null, today: string): PeriodChoice {
  const pay = resolvePolicy(householdId, childId, today).pay;
  const period = payPeriodFor(today, {
    cadence: pay.cadence,
    periodStartDay: pay.periodStartDay,
    payDateOffsetDays: pay.payDateOffsetDays,
  });
  return { ...period, nextStart: addDays(period.endDate, 1) };
}

function describe(field: FieldSpec, value: unknown): string {
  if (field.type === "boolean") return value ? "on" : "off";
  if (field.type === "select") {
    return field.options?.find((o) => o.value === String(value))?.label ?? String(value);
  }
  if (field.type === "percent") return `${value}%`;
  return String(value);
}

/**
 * What's already scheduled to change for this scope, date by date, as
 * "Label: old → new" lines — compared against what's in effect today.
 */
export function scheduledChanges(
  householdId: string,
  scopeType: "household" | "child",
  scopeId: string,
  today: string,
): { from: string; lines: string[] }[] {
  const childId = scopeType === "child" ? scopeId : null;
  const now = resolvePolicy(householdId, childId, today);

  return scheduledVersionDates(scopeType, scopeId, today)
    .map((from) => {
      const then = resolvePolicy(householdId, childId, from);
      const lines = SETTINGS_SECTIONS.flatMap((s) => s.fields).flatMap((f) => {
        const a = getAtPath(now, f.path);
        const b = getAtPath(then, f.path);
        return a === b ? [] : [`${f.label}: ${describe(f, a)} → ${describe(f, b)}`];
      });
      return { from, lines };
    })
    .filter((s) => s.lines.length > 0);
}
