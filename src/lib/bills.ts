import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  account,
  bill,
  billInstance,
  child,
  ledgerEntry,
  type AccountType,
  type BillInstanceStatus,
} from "@/db/schema";
import {
  addDays,
  fromIsoDate,
  resolveMonthlyDueDate,
  todayInHousehold,
  type IsoDate,
} from "@/lib/dates";
import { recordTransaction } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { getBalances } from "@/lib/ledger";

/**
 * Bills (SPEC §6.3).
 *
 * Rent is not special. It is a bill whose disposition is `held_for_child`,
 * which is what makes the rent fund a secret the application keeps: the
 * disposition is parent-only data and never reaches a child-facing view.
 *
 * The lesson lives in the shortfall. A bill is due whether or not a paycheck was
 * earned, so a child who spent everything has to feel that — but bounded, and
 * never as a debt they cannot climb out of.
 */

export type BillRow = typeof bill.$inferSelect;

/** Generate instances far enough ahead that the nudge has something to point at. */
export function generateInstances(horizonDays = 60, now: IsoDate = todayInHousehold()) {
  const bills = db.select().from(bill).where(eq(bill.active, true)).all();
  const horizon = addDays(now, horizonDays);
  let created = 0;

  for (const b of bills) {
    for (const dueDate of dueDatesBetween(b, now, horizon)) {
      if (dueDate < b.effectiveFrom) continue;

      const exists = db
        .select({ id: billInstance.id })
        .from(billInstance)
        .where(and(eq(billInstance.billId, b.id), eq(billInstance.dueDate, dueDate)))
        .get();

      if (exists) continue;

      db.insert(billInstance)
        .values({
          billId: b.id,
          childId: b.childId,
          dueDate,
          amountCents: b.amountCents,
          status: "scheduled",
          policySnapshotJson: {
            autopay: b.autopay,
            sourceAccountOrder: b.sourceAccountOrder,
            shortfallPolicy: b.shortfallPolicy,
            disposition: b.disposition,
            mayUseEarmarked: b.mayUseEarmarked,
          },
        })
        .run();
      created++;
    }
  }

  return created;
}

function dueDatesBetween(b: BillRow, from: IsoDate, to: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];

  if (b.cadence === "weekly") {
    let cursor = from;
    while (cursor <= to) {
      if (fromIsoDate(cursor).getDay() === b.dueDay) dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates;
  }

  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  let year = start.getFullYear();
  let month = start.getMonth() + 1;

  while (year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth() + 1)) {
    const due = resolveMonthlyDueDate(year, month, b.dueDay, b.nonexistentDateRule);
    if (due >= from && due <= to) dates.push(due);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return dates;
}

/**
 * Collect a bill.
 *
 * Goal money is protected unless the parent opted in, because a child watching
 * their Lego fund drain to pay rent learns that saving is pointless.
 */
export function collectBill(instanceId: string): {
  collected: number;
  shortfall: number;
} {
  const instance = db
    .select()
    .from(billInstance)
    .where(eq(billInstance.id, instanceId))
    .get();
  if (!instance) throw new Error("Bill instance not found.");
  if (instance.status === "paid" || instance.status === "waived") {
    return { collected: 0, shortfall: 0 };
  }

  const b = db.select().from(bill).where(eq(bill.id, instance.billId)).get();
  if (!b) throw new Error("Bill not found.");

  let needed = instance.amountCents - instance.paidCents;
  let collected = 0;

  if (b.autopay) {
    const balances = getBalances(instance.childId);

    for (const accountType of b.sourceAccountOrder as AccountType[]) {
      if (needed <= 0) break;

      const available =
        accountType === "savings" && !b.mayUseEarmarked
          ? balances.savingsGeneral
          : balances[accountType as keyof typeof balances] ?? 0;

      const take = Math.min(needed, Math.max(0, available));
      if (take <= 0) continue;

      recordTransaction({
        childId: instance.childId,
        accountType,
        amountCents: -take,
        type: "bill_payment",
        description: `${b.name} — ${formatCents(instance.amountCents)} due`,
        source: "system",
        billInstanceId: instance.id,
      });

      // The disposition decides where collected money goes. `held_for_child` is
      // the rent fund; the other two leave the child's world entirely.
      if (b.disposition === "held_for_child") {
        recordTransaction({
          childId: instance.childId,
          accountType: "held",
          amountCents: take,
          type: "bill_charge",
          description: `${b.name} held for the future`,
          source: "system",
          billInstanceId: instance.id,
          allowNegative: true,
        });
      }

      collected += take;
      needed -= take;
    }
  }

  const paidCents = instance.paidCents + collected;
  let status: BillInstanceStatus;

  if (paidCents >= instance.amountCents) {
    status = "paid";
  } else if (b.shortfallPolicy === "waive") {
    status = "waived";
  } else if (paidCents > 0 && b.shortfallPolicy === "partial_pay_carry_remainder") {
    status = "partially_paid";
  } else {
    status = "past_due";
  }

  db.update(billInstance)
    .set({ paidCents, status, paidAt: collected > 0 ? Date.now() : instance.paidAt })
    .where(eq(billInstance.id, instance.id))
    .run();

  return { collected, shortfall: Math.max(0, instance.amountCents - paidCents) };
}

/** Run collection for everything due today or overdue. Idempotent per instance. */
export function runBillCycle(now: IsoDate = todayInHousehold()) {
  generateInstances(60, now);

  const due = db
    .select()
    .from(billInstance)
    .where(
      and(
        lte(billInstance.dueDate, now),
        inArray(billInstance.status, ["scheduled", "due", "partially_paid", "past_due"]),
      ),
    )
    .orderBy(asc(billInstance.dueDate))
    .all();

  const results: { instanceId: string; collected: number; shortfall: number }[] = [];

  for (const instance of due) {
    const result = collectBill(instance.id);
    results.push({ instanceId: instance.id, ...result });
  }

  return results;
}

export type UpcomingBill = {
  instanceId: string;
  billName: string;
  dueDate: IsoDate;
  amountCents: number;
  outstandingCents: number;
  status: BillInstanceStatus;
  /** Set when the child cannot currently cover it — this drives the nudge. */
  shortfallCents: number;
};

/**
 * Upcoming bills with a projected shortfall.
 *
 * "Rent is due in 3 days. You have $12. You need $15." is where the planning
 * lesson actually lands, so this is computed for display rather than only at
 * collection time. A pending paycheck deliberately does not count toward
 * covering it — that gap is the lesson.
 */
export function upcomingBills(childId: string, withinDays = 14): UpcomingBill[] {
  const now = todayInHousehold();
  const horizon = addDays(now, withinDays);
  const balances = getBalances(childId);

  const rows = db
    .select({ instance: billInstance, billRow: bill })
    .from(billInstance)
    .innerJoin(bill, eq(billInstance.billId, bill.id))
    .where(
      and(
        eq(billInstance.childId, childId),
        lte(billInstance.dueDate, horizon),
        inArray(billInstance.status, ["scheduled", "due", "partially_paid", "past_due"]),
      ),
    )
    .orderBy(asc(billInstance.dueDate))
    .all();

  return rows.map(({ instance, billRow }) => {
    const outstanding = instance.amountCents - instance.paidCents;

    const available = (billRow.sourceAccountOrder as AccountType[]).reduce(
      (sum, a) =>
        sum +
        (a === "savings" && !billRow.mayUseEarmarked
          ? balances.savingsGeneral
          : (balances[a as keyof typeof balances] ?? 0)),
      0,
    );

    return {
      instanceId: instance.id,
      billName: billRow.name,
      dueDate: instance.dueDate,
      amountCents: instance.amountCents,
      outstandingCents: outstanding,
      status: instance.status,
      shortfallCents: Math.max(0, outstanding - Math.max(0, available)),
    };
  });
}

export function listBills(childId: string) {
  return db
    .select()
    .from(bill)
    .where(and(eq(bill.childId, childId), eq(bill.active, true)))
    .orderBy(asc(bill.name))
    .all();
}

/**
 * Parent-only view of what the household is holding on a child's behalf.
 * Invariant I4: never rendered into a child-facing response.
 */
export function heldFundTotal(householdId: string): number {
  const rows = db
    .select({ balance: account.balanceCents })
    .from(account)
    .innerJoin(child, eq(account.childId, child.id))
    .where(and(eq(child.householdId, householdId), eq(account.type, "held")))
    .all();

  return rows.reduce((sum, r) => sum + r.balance, 0);
}

export const DISPOSITION_LABELS = {
  held_for_child: "Held secretly for the child",
  disappears: "Gone — a real expense",
  family_fund: "Into a family fund",
} as const;
