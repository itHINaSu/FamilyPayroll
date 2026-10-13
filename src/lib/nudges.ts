import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { child, household, paystub, payPeriod } from "@/db/schema";
import { upcomingBills } from "@/lib/bills";
import { formatCents } from "@/lib/money";
import { notifyParents } from "@/lib/notifications";

/**
 * The daily nudges.
 *
 * The shortfall warning is the most important notification this system sends,
 * because it is where the planning lesson actually lands:
 *
 *   "Rent is due in 3 days. You have $12.00. You need $15.00."
 *
 * A pending paycheck deliberately does not count toward covering it. That gap is
 * the whole point.
 */
export async function sendDailyNudges(): Promise<void> {
  const households = db.select().from(household).all();

  for (const home of households) {
    const children = db
      .select()
      .from(child)
      .where(and(eq(child.householdId, home.id), eq(child.status, "active")))
      .all();

    for (const c of children) {
      for (const bill of upcomingBills(c.id, 3)) {
        if (bill.shortfallCents > 0) {
          await notifyParents(home.id, "bill_shortfall_predicted", {
            title: `${c.displayName} will be short for ${bill.billName}`,
            body:
              `Due ${bill.dueDate}. They need ${formatCents(bill.outstandingCents)} ` +
              `and are ${formatCents(bill.shortfallCents)} short.`,
            url: `/children/${c.id}/bills`,
            tag: `shortfall-${c.id}`,
          });
        } else {
          await notifyParents(home.id, "bill_due_soon", {
            title: `${bill.billName} is due ${bill.dueDate}`,
            body: `${c.displayName} has enough set aside.`,
            url: `/children/${c.id}/bills`,
            tag: `due-${c.id}`,
          });
        }
      }
    }

    const drafts = db
      .select({ stub: paystub, period: payPeriod })
      .from(paystub)
      .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
      .where(eq(paystub.status, "draft"))
      .all();

    for (const { stub, period } of drafts) {
      const c = children.find((x) => x.id === stub.childId);
      if (!c) continue;

      await notifyParents(home.id, "payroll_draft_ready", {
        title: `${c.displayName}'s pay stub is ready`,
        body:
          `${formatCents(stub.earnedCents)} of ${formatCents(stub.potentialCents)} earned. ` +
          `Posts on its own ${period.payDate} unless you change it.`,
        url: `/children/${c.id}/pay`,
        tag: `draft-${c.id}`,
      });
    }
  }
}
