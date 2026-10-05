import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, billInstance, child, excusal, household, payPeriod, paystub } from "@/db/schema";
import { addDays, todayInHousehold } from "@/lib/dates";

/**
 * Pausing and resuming the money cycle.
 *
 * Skipping the nightly task alone is not enough, because three things would
 * otherwise catch up all at once on resume:
 *  - drafts made before the pause would post the moment their pay date passed;
 *  - every bill instance that came due during the pause would be collected;
 *  - the first period after resuming would count the paused days as missed.
 * Pausing clears the first two (neither has touched the ledger yet — only
 * posted stubs and collected bills do), and resuming excuses the third.
 */

export function payrollPausedOn(householdId: string): string | null {
  return (
    db
      .select({ pausedOn: household.payrollPausedOn })
      .from(household)
      .where(eq(household.id, householdId))
      .get()?.pausedOn ?? null
  );
}

function childIdsFor(householdId: string): string[] {
  return db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.householdId, householdId))
    .all()
    .map((c) => c.id);
}

export function pausePayroll(
  householdId: string,
  actorUserId: string,
): { discardedDrafts: number; clearedBills: number } {
  const today = todayInHousehold();
  const childIds = childIdsFor(householdId);

  return db.transaction((tx) => {
    let discardedDrafts = 0;
    let clearedBills = 0;

    if (childIds.length > 0) {
      const draftPeriods = tx
        .select({ periodId: paystub.payPeriodId })
        .from(paystub)
        .where(and(inArray(paystub.childId, childIds), eq(paystub.status, "draft")))
        .all()
        .map((r) => r.periodId);

      if (draftPeriods.length > 0) {
        // Cascades to the draft stub and its lines. A period only ever has
        // one stub, so a period with a draft has nothing posted to lose.
        tx.delete(payPeriod).where(inArray(payPeriod.id, draftPeriods)).run();
        discardedDrafts = draftPeriods.length;
      }

      // Untouched instances only — anything already due, part-paid, or past
      // due is a real obligation in progress and stays exactly as it is.
      clearedBills = tx
        .delete(billInstance)
        .where(and(inArray(billInstance.childId, childIds), eq(billInstance.status, "scheduled")))
        .run().changes;
    }

    tx.update(household)
      .set({ payrollPausedOn: today })
      .where(eq(household.id, householdId))
      .run();

    tx.insert(auditLog)
      .values({
        actorUserId,
        action: "payroll.paused",
        entityType: "household",
        entityId: householdId,
        afterJson: { pausedOn: today, discardedDrafts, clearedBills },
      })
      .run();

    return { discardedDrafts, clearedBills };
  });
}

export function resumePayroll(householdId: string, actorUserId: string): { excusedDays: number } {
  const today = todayInHousehold();
  const pausedOn = payrollPausedOn(householdId);
  const lastPausedDay = addDays(today, -1);

  return db.transaction((tx) => {
    let excusedDays = 0;

    // Paused at least one full day: excuse that stretch for every child, so
    // the period that straddles the resume date doesn't read those days as
    // missed. An excusal lowers potential rather than counting a miss — the
    // same mechanism a parent uses by hand for a sick week.
    if (pausedOn && pausedOn <= lastPausedDay) {
      const kids = tx
        .select({ id: child.id })
        .from(child)
        .where(and(eq(child.householdId, householdId), ne(child.status, "archived")))
        .all();

      for (const k of kids) {
        tx.insert(excusal)
          .values({
            childId: k.id,
            startDate: pausedOn,
            endDate: lastPausedDay,
            reason: "Payroll paused",
            scope: "all",
            createdByUserId: actorUserId,
          })
          .run();
      }

      excusedDays =
        Math.round(
          (new Date(`${lastPausedDay}T12:00:00`).getTime() -
            new Date(`${pausedOn}T12:00:00`).getTime()) /
            86_400_000,
        ) + 1;
    }

    tx.update(household)
      .set({ payrollPausedOn: null, payrollResumedOn: today })
      .where(eq(household.id, householdId))
      .run();

    tx.insert(auditLog)
      .values({
        actorUserId,
        action: "payroll.resumed",
        entityType: "household",
        entityId: householdId,
        afterJson: { resumedOn: today, pausedOn, excusedDays },
      })
      .run();

    return { excusedDays };
  });
}
