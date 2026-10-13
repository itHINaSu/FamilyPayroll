import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { payPeriod, paystub } from "@/db/schema";
import { upcomingBills } from "@/lib/bills";
import { ageFromBirthdate, getChild, listEarningChildren } from "@/lib/children";
import { payPeriodFor, todayInHousehold, type IsoDate } from "@/lib/dates";
import { getBalances } from "@/lib/ledger";
import { pendingJobClaims } from "@/lib/jobs";
import { resolvePolicy } from "@/lib/policy";
import {
  describeCadence,
  evaluatePeriod,
  listResponsibilities,
  type WeekBreakdown,
} from "@/lib/responsibilities";

/**
 * This pay period, per child: the numbers the Dashboard shows and the week
 * of boxes the Expectations tab shows, assembled once so both agree.
 */

export type ExpectationView = {
  id: string;
  name: string;
  cadenceLabel: string;
  weeklyValueCents: number;
  payMode: "expected" | "optional";
  allOrNothing: boolean;
  potentialCents: number;
  earnedCents: number;
  lostCents: number;
  toEarnCents: number;
  missed: number;
  weeks: WeekBreakdown[];
  misses: { id: string; date: IsoDate; note: string | null }[];
};

export type ChildWeek = {
  id: string;
  name: string;
  age: number;
  photoBlobId: string | null;
  status: string;
  period: { startDate: IsoDate; endDate: IsoDate; payDate: IsoDate };
  /** Index into each expectation's `weeks` for the week containing today. */
  currentWeek: number;
  checkingCents: number;
  savingsCents: number;
  totalCents: number;
  potentialCents: number;
  /** What this period pays if nothing else changes: keep-it minus misses, plus earn-it done. */
  onTrackCents: number;
  lostCents: number;
  expectations: ExpectationView[];
  shortfall: { billName: string; dueDate: IsoDate; shortCents: number } | null;
  /** The next bill due within a week, if any. */
  nextBill: { name: string; dueDate: IsoDate; amountCents: number } | null;
};

function buildChildWeek(
  householdId: string,
  c: { id: string; displayName: string; birthdate: string; photoBlobId: string | null; status: string },
  today: IsoDate,
): ChildWeek {
  const policy = resolvePolicy(householdId, c.id, today);
  const period = payPeriodFor(today, {
    cadence: policy.pay.cadence,
    periodStartDay: policy.pay.periodStartDay,
    payDateOffsetDays: policy.pay.payDateOffsetDays,
  });

  const expectations: ExpectationView[] = listResponsibilities(c.id)
    .filter((r) => r.effectiveFrom <= period.endDate)
    .map((r) => {
      const result = evaluatePeriod(
        r,
        c.id,
        period.startDate,
        period.endDate,
        policy.completion.mode,
        today,
      );
      return {
        id: r.id,
        name: r.name,
        cadenceLabel: describeCadence(r),
        weeklyValueCents: r.weeklyValueCents,
        payMode: r.payMode,
        allOrNothing: r.allOrNothing,
        potentialCents: result.potentialCents,
        earnedCents: result.earnedCents,
        lostCents: result.lostCents,
        toEarnCents: result.toEarnCents,
        missed: result.missed,
        weeks: result.weeks,
        misses: result.misses,
      };
    });

  const sampleWeeks = expectations[0]?.weeks ?? [];
  const currentWeek = Math.max(
    0,
    sampleWeeks.findIndex((w) => today >= w.start && today <= w.end),
  );

  const balances = getBalances(c.id);
  const bills = upcomingBills(c.id, 7);
  const short = bills.find((b) => b.shortfallCents > 0);
  const sum = (key: "potentialCents" | "earnedCents" | "lostCents") =>
    expectations.reduce((n, e) => n + e[key], 0);

  return {
    id: c.id,
    name: c.displayName,
    age: ageFromBirthdate(c.birthdate),
    photoBlobId: c.photoBlobId,
    status: c.status,
    period: { startDate: period.startDate, endDate: period.endDate, payDate: period.payDate },
    currentWeek,
    checkingCents: balances.checking,
    savingsCents: balances.savings,
    totalCents: balances.visibleTotal,
    potentialCents: sum("potentialCents"),
    onTrackCents: sum("earnedCents"),
    lostCents: sum("lostCents"),
    expectations,
    shortfall: short
      ? { billName: short.billName, dueDate: short.dueDate, shortCents: short.shortfallCents }
      : null,
    nextBill: bills[0]
      ? { name: bills[0].billName, dueDate: bills[0].dueDate, amountCents: bills[0].outstandingCents }
      : null,
  };
}

export function householdWeek(householdId: string): { today: IsoDate; children: ChildWeek[] } {
  const today = todayInHousehold();
  const policy = resolvePolicy(householdId, null, today);
  const children = listEarningChildren(householdId, {
    showNotYetEarning: policy.display.showNotYetEarning,
    order: policy.display.childOrder,
  });
  return { today, children: children.map((c) => buildChildWeek(householdId, c, today)) };
}

export function childWeek(householdId: string, childId: string): ChildWeek | null {
  const c = getChild(householdId, childId);
  if (!c) return null;
  return buildChildWeek(householdId, c, todayInHousehold());
}

/** Things genuinely waiting on a parent, for the top of the Dashboard. */
export function attentionItems(householdId: string) {
  const drafts = db
    .select({ stub: paystub, period: payPeriod })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .where(eq(paystub.status, "draft"))
    .all();

  return {
    draftPaystubs: drafts.length,
    nextPayDate: drafts.map((d) => d.period.payDate).sort()[0] ?? null,
    pendingJobs: pendingJobClaims(householdId).length,
  };
}
