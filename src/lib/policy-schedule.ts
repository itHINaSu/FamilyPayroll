import "server-only";

import { db } from "@/db";
import { listEarningChildren } from "@/lib/children";
import { addDays, daysBetween, payPeriodFor } from "@/lib/dates";
import { coveredPeriodFor, discardStaleDrafts, periodsAhead } from "@/lib/payroll";
import { describeGap } from "@/lib/payday";
import { payrollPausedOn } from "@/lib/payroll-pause";
import {
  PAY_PERIOD_SECTIONS,
  changeSection,
  resolvePolicy,
  savePolicyChanges,
  scheduledVersionDates,
  type PolicyChange,
} from "@/lib/policy";
import { SETTINGS_SECTIONS, getAtPath, type FieldSpec } from "@/lib/settings-schema";

/** This pay period and when the next one starts, for the "when should this start?" prompt. */
export type PeriodChoice = { startDate: string; endDate: string; payDate: string; nextStart: string };

export function periodChoice(householdId: string, childId: string | null, today: string): PeriodChoice {
  // The family's choice is shown for their first earning child, whose period
  // follows what's actually been paid (see coveredPeriodFor).
  const forChild =
    childId ??
    listEarningChildren(householdId, { showNotYetEarning: false })[0]?.id ??
    null;

  if (forChild) {
    const period = coveredPeriodFor(householdId, forChild, today);
    return {
      startDate: period.startDate,
      endDate: period.endDate,
      payDate: period.payDate,
      nextStart: addDays(period.endDate, 1),
    };
  }

  const pay = resolvePolicy(householdId, null, today).pay;
  const period = payPeriodFor(today, {
    cadence: pay.cadence,
    periodStartDay: pay.periodStartDay,
    payDateOffsetDays: pay.payDateOffsetDays,
  });
  return { ...period, nextStart: addDays(period.endDate, 1) };
}

export type ApplyFrom = "current" | "next";

/**
 * Save settings changes. Pay-affecting ones start on the date the parent
 * chose — the start of this pay period, or the day the next one begins;
 * everything else (who can move money, display, kiosk) starts today.
 */
export function saveDatedChanges(input: {
  householdId: string;
  scopeType: "household" | "child";
  scopeId: string;
  changes: PolicyChange[];
  applyFrom: ApplyFrom;
  today: string;
  createdByUserId?: string;
  note?: string;
}): { payChanged: boolean; startsOn: string | null } {
  const childId = input.scopeType === "child" ? input.scopeId : null;
  const period = periodChoice(input.householdId, childId, input.today);

  const pay = input.changes.filter((c) => PAY_PERIOD_SECTIONS.includes(changeSection(c)));
  const other = input.changes.filter((c) => !PAY_PERIOD_SECTIONS.includes(changeSection(c)));
  const payFrom = input.applyFrom === "next" ? period.nextStart : period.startDate;

  const common = {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    createdByUserId: input.createdByUserId,
    note: input.note,
  };
  savePolicyChanges({ ...common, changes: other, effectiveFrom: input.today });
  savePolicyChanges({ ...common, changes: pay, effectiveFrom: payFrom });
  // A draft made under the old schedule would otherwise still post.
  if (pay.length > 0) discardStaleDrafts(input.householdId);

  return {
    payChanged: pay.length > 0,
    startsOn: pay.length > 0 && input.applyFrom === "next" ? payFrom : null,
  };
}

/** One pay period as the "when should this start?" prompt shows it. */
export type PreviewPeriod = {
  startDate: string;
  endDate: string;
  payDate: string;
  days: number;
  /** How long the schedule's periods normally are, to flag a short or long one. */
  usualDays: number;
};

export type PayPreview = {
  today: string;
  paused: boolean;
  current: PreviewPeriod[];
  next: PreviewPeriod[];
};

class Rollback extends Error {}

/**
 * What each answer to "when should this start?" would do to the pay periods:
 * anything already due, this period, and the one after. Worked out by making
 * the change for real and rolling it back, so it can't disagree with what
 * saving does.
 */
export function previewPayChoices(input: {
  householdId: string;
  scopeType: "household" | "child";
  scopeId: string;
  changes: PolicyChange[];
  today: string;
}): PayPreview | null {
  const childId =
    input.scopeType === "child"
      ? input.scopeId
      : listEarningChildren(input.householdId, { showNotYetEarning: false })[0]?.id;
  if (!childId) return null;

  const outcome = (applyFrom: ApplyFrom): PreviewPeriod[] => {
    let periods: PreviewPeriod[] = [];
    try {
      db.transaction(() => {
        saveDatedChanges({ ...input, applyFrom });
        periods = periodsAhead(input.householdId, childId, input.today).map((p) => {
          const pay = resolvePolicy(input.householdId, childId, p.endDate).pay;
          const usual = payPeriodFor(p.endDate, {
            cadence: pay.cadence,
            periodStartDay: pay.periodStartDay,
            payDateOffsetDays: pay.payDateOffsetDays,
          });
          return {
            startDate: p.startDate,
            endDate: p.endDate,
            payDate: p.payDate,
            days: daysBetween(p.startDate, p.endDate) + 1,
            usualDays: daysBetween(usual.startDate, usual.endDate) + 1,
          };
        });
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    return periods;
  };

  return {
    today: input.today,
    paused: !!payrollPausedOn(input.householdId),
    current: outcome("current"),
    next: outcome("next"),
  };
}

function describe(field: FieldSpec, value: unknown): string {
  if (field.type === "boolean") return value ? "on" : "off";
  if (field.type === "select") {
    return field.options?.find((o) => o.value === String(value))?.label ?? String(value);
  }
  if (field.type === "percent") return `${value}%`;
  if (field.type === "payday") return describeGap(Number(value));
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
