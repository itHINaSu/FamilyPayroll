import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { completion, payPeriod, paystub } from "@/db/schema";
import { upcomingBills } from "@/lib/bills";
import { ageFromBirthdate, listEarningChildren } from "@/lib/children";
import { eachDate, payPeriodFor, todayInHousehold, type IsoDate } from "@/lib/dates";
import { getBalances } from "@/lib/ledger";
import { pendingJobClaims } from "@/lib/jobs";
import { resolvePolicy } from "@/lib/policy";
import {
  effectivePayMode,
  evaluatePeriod,
  excusedDates,
  listResponsibilities,
  occurrenceDates,
  weekBlocks,
} from "@/lib/responsibilities";

/**
 * The daily view.
 *
 * Ticking things off is by far the highest-frequency action in this system, and
 * it was previously three clicks deep inside a per-child tab. This assembles
 * everything a parent needs on a weeknight — today's responsibilities for every
 * child, and anything actually waiting on them — into one screen.
 *
 * Deliberately not a second dashboard: the money view is a click away, because
 * balances are something you check occasionally and this is something you do.
 */

export type TodayItem = {
  responsibilityId: string;
  name: string;
  /** False on a day this responsibility does not apply, e.g. Tuesdays only. */
  dueToday: boolean;
  doneToday: boolean;
  /** Keep-it only: a miss has been marked for today. */
  missedToday: boolean;
  /** The day a tap acts on: today, or for weekly the day already marked this week. */
  toggleDate: IsoDate;
  weekly: boolean;
  payMode: "expected" | "optional";
  allOrNothing: boolean;
  excusedToday: boolean;
  /** Up-to-N allows several a day, so this counts rather than toggles. */
  repeatable: boolean;
  doneTodayCount: number;
  weekCompleted: number;
  weekChances: number;
  weekMissed: number;
  /** Earn-it: still available this period. */
  toEarnCents: number;
  /** Keep-it: docked this period. */
  lostCents: number;
};

export type TodayChild = {
  id: string;
  name: string;
  age: number;
  photoBlobId: string | null;
  status: string;
  items: TodayItem[];
  earnedCents: number;
  potentialCents: number;
  payDate: IsoDate;
  balanceCents: number;
  /** Set only when they cannot currently cover a bill — this is the nudge. */
  shortfall: { billName: string; dueDate: IsoDate; shortCents: number } | null;
};

export function todayForHousehold(householdId: string): {
  today: IsoDate;
  children: TodayChild[];
} {
  const today = todayInHousehold();
  const householdPolicy = resolvePolicy(householdId, null, today);

  const children = listEarningChildren(householdId, {
    showNotYetEarning: householdPolicy.display.showNotYetEarning,
    order: householdPolicy.display.childOrder,
  });

  return {
    today,
    children: children.map((c) => {
      const policy = resolvePolicy(householdId, c.id, today);
      const period = payPeriodFor(today, {
        cadence: policy.pay.cadence,
        periodStartDay: policy.pay.periodStartDay,
        payDateOffsetDays: policy.pay.payDateOffsetDays,
      });

      const completions = db
        .select()
        .from(completion)
        .where(
          and(
            eq(completion.childId, c.id),
            gte(completion.occurrenceDate, period.startDate),
            lte(completion.occurrenceDate, period.endDate),
          ),
        )
        .all();

      let earnedCents = 0;
      let potentialCents = 0;

      const items: TodayItem[] = listResponsibilities(c.id).map((r) => {
        const result = evaluatePeriod(
          r,
          c.id,
          period.startDate,
          period.endDate,
          policy.completion.mode,
        );

        const applicable = new Set(
          occurrenceDates(r, period.startDate, period.endDate),
        );
        const excused = excusedDates(c.id, r.id, period.startDate, period.endDate);
        // Weekly is once on any day, so "today" means this week.
        const thisWeek =
          r.cadence === "weekly"
            ? new Set(
                weekBlocks(
                  eachDate(period.startDate, period.endDate),
                  period.startDate,
                  result.chances,
                ).find((w) => w.includes(today)) ?? [today],
              )
            : new Set([today]);
        const todayAll = completions.filter(
          (x) => x.responsibilityId === r.id && thisWeek.has(x.occurrenceDate),
        );
        const todayRows = todayAll.filter((x) => x.status !== "missed");

        earnedCents += result.earnedCents;
        potentialCents += result.potentialCents;

        return {
          responsibilityId: r.id,
          name: r.name,
          dueToday: applicable.has(today),
          doneToday: todayRows.length > 0,
          missedToday: todayAll.some((x) => x.status === "missed"),
          toggleDate: todayAll[0]?.occurrenceDate ?? today,
          weekly: r.cadence === "weekly",
          payMode: effectivePayMode(r),
          allOrNothing: r.allOrNothing,
          excusedToday: excused.has(today),
          repeatable: r.cadence === "up_to_n",
          doneTodayCount: todayRows.length,
          weekCompleted: result.completed,
          weekChances: result.chances,
          weekMissed: result.missed,
          toEarnCents: result.toEarnCents,
          lostCents: result.lostCents,
        };
      });

      const balances = getBalances(c.id);
      const short = upcomingBills(c.id, 7).find((b) => b.shortfallCents > 0);

      return {
        id: c.id,
        name: c.displayName,
        age: ageFromBirthdate(c.birthdate),
        photoBlobId: c.photoBlobId,
        status: c.status,
        items,
        earnedCents,
        potentialCents,
        payDate: period.payDate,
        balanceCents: balances.visibleTotal,
        shortfall: short
          ? {
              billName: short.billName,
              dueDate: short.dueDate,
              shortCents: short.shortfallCents,
            }
          : null,
      };
    }),
  };
}

/** Things genuinely waiting on a parent, for the top of the daily view. */
export function attentionItems(householdId: string) {
  const today = todayInHousehold();

  const drafts = db
    .select({ stub: paystub, period: payPeriod })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .where(eq(paystub.status, "draft"))
    .all();

  return {
    draftPaystubs: drafts.length,
    // A draft posts itself on its pay date, so this is informational rather
    // than a task — worded that way in the UI.
    nextPayDate: drafts.map((d) => d.period.payDate).sort()[0] ?? null,
    pendingJobs: pendingJobClaims(householdId).length,
    today,
  };
}

export function periodDays(householdId: string, childId: string): IsoDate[] {
  const today = todayInHousehold();
  const policy = resolvePolicy(householdId, childId, today);
  const period = payPeriodFor(today, {
    cadence: policy.pay.cadence,
    periodStartDay: policy.pay.periodStartDay,
    payDateOffsetDays: policy.pay.payDateOffsetDays,
  });
  return eachDate(period.startDate, period.endDate);
}
