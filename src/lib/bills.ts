import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  account,
  bill,
  billInstance,
  billTemplate,
  child,
  ledgerEntry,
  type AccountType,
  type BillCadence,
  type BillDisposition,
  type BillInstanceStatus,
} from "@/db/schema";
import { listChildren } from "@/lib/children";
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
import { resolvePolicy } from "@/lib/policy";

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
    .select({ instance: billInstance })
    .from(billInstance)
    .innerJoin(bill, eq(billInstance.billId, bill.id))
    .where(
      and(
        eq(bill.active, true),
        lte(billInstance.dueDate, now),
        inArray(billInstance.status, ["scheduled", "due", "partially_paid", "past_due"]),
      ),
    )
    .orderBy(asc(billInstance.dueDate))
    .all();

  const results: { instanceId: string; collected: number; shortfall: number }[] = [];

  for (const { instance } of due) {
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
        eq(bill.active, true),
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

// ---------------------------------------------------------------------------
// Family-level templates — the exact same pattern as responsibility
// templates: created once, instantiated per child, edits propagate to
// whoever hasn't customized their own copy.
// ---------------------------------------------------------------------------

export type BillTemplateRow = typeof billTemplate.$inferSelect;

export type BillTemplateInput = {
  name: string;
  amountCents: number;
  cadence: BillCadence;
  dueDay: number;
  disposition: BillDisposition;
  sourceAccountOrder: AccountType[];
  mayUseEarmarked: boolean;
  autopay: boolean;
};

/** Past-due handling stays policy-derived per child, not part of the template. */
function policyDerivedBillFields(householdId: string, childId: string, amountCents: number) {
  const policy = resolvePolicy(householdId, childId);
  return {
    shortfallPolicy: policy.bills.shortfallPolicy,
    pastDueRecovery: policy.bills.pastDueRecovery,
    pastDueMaxRecoveryPct: policy.bills.pastDueMaxRecoveryPct,
    pastDueCapCents: Math.round(amountCents * policy.bills.pastDueCapMultiple),
    nonexistentDateRule: policy.bills.nonexistentDateRule,
  };
}

export function listBillTemplates(householdId: string, activeOnly = true) {
  const where = activeOnly
    ? and(eq(billTemplate.householdId, householdId), eq(billTemplate.active, true))
    : eq(billTemplate.householdId, householdId);

  return db
    .select()
    .from(billTemplate)
    .where(where)
    .orderBy(asc(billTemplate.name))
    .all();
}

/**
 * Creates a family bill and gives it to the chosen children (all of them by
 * default). Picking everyone also gives it to children added later.
 */
export function createBillTemplate(
  householdId: string,
  input: BillTemplateInput,
  childIds?: string[],
): BillTemplateRow {
  const children = listChildren(householdId);
  const chosen = childIds ? children.filter((c) => childIds.includes(c.id)) : children;
  const template = db
    .insert(billTemplate)
    .values({ householdId, ...input, appliesToNewChildren: chosen.length === children.length })
    .returning()
    .get();

  const today = todayInHousehold();
  for (const c of chosen) {
    db.insert(bill)
      .values({
        childId: c.id,
        templateId: template.id,
        syncedWithTemplate: true,
        name: template.name,
        amountCents: template.amountCents,
        cadence: template.cadence,
        dueDay: template.dueDay,
        disposition: template.disposition,
        sourceAccountOrder: template.sourceAccountOrder,
        mayUseEarmarked: template.mayUseEarmarked,
        autopay: template.autopay,
        ...policyDerivedBillFields(householdId, c.id, template.amountCents),
        effectiveFrom: today,
      })
      .run();
  }

  generateInstances();
  return template;
}

export function updateBillTemplate(templateId: string, input: BillTemplateInput): void {
  db.update(billTemplate).set(input).where(eq(billTemplate.id, templateId)).run();

  const synced = db
    .select({ id: bill.id })
    .from(bill)
    .where(and(eq(bill.templateId, templateId), eq(bill.syncedWithTemplate, true), eq(bill.active, true)))
    .all();

  for (const b of synced) {
    db.update(bill).set(input).where(eq(bill.id, b.id)).run();
  }

  generateInstances();
}

export function archiveBillTemplate(templateId: string): void {
  const now = Date.now();
  db.update(billTemplate).set({ active: false, archivedAt: now }).where(eq(billTemplate.id, templateId)).run();

  const rows = db
    .select({ id: bill.id })
    .from(bill)
    .where(and(eq(bill.templateId, templateId), eq(bill.active, true)))
    .all();
  for (const b of rows) {
    db.update(bill).set({ active: false, archivedAt: now }).where(eq(bill.id, b.id)).run();
    cancelScheduledInstances(b.id);
  }
}

/**
 * Removes a bill's not-yet-touched future instances. Called whenever a bill
 * goes inactive — the `bill.active` filter on upcomingBills/runBillCycle
 * already stops one from being collected or shown, but a dangling
 * `scheduled` row with nothing paid against it is otherwise pointless
 * leftover data, not history worth keeping.
 */
export function cancelScheduledInstances(billId: string): void {
  db.delete(billInstance)
    .where(and(eq(billInstance.billId, billId), eq(billInstance.status, "scheduled")))
    .run();
}

export function disableBillTemplateForChild(childId: string, templateId: string): void {
  const row = db
    .select({ id: bill.id })
    .from(bill)
    .where(and(eq(bill.childId, childId), eq(bill.templateId, templateId), eq(bill.active, true)))
    .get();
  if (!row) return;

  db.update(bill)
    .set({ active: false, archivedAt: Date.now() })
    .where(eq(bill.id, row.id))
    .run();

  cancelScheduledInstances(row.id);
}

export function enableBillTemplateForChild(householdId: string, childId: string, templateId: string): void {
  const template = db.select().from(billTemplate).where(eq(billTemplate.id, templateId)).get();
  if (!template) return;

  const existing = db
    .select()
    .from(bill)
    .where(and(eq(bill.childId, childId), eq(bill.templateId, templateId)))
    .all();
  if (existing.some((b) => b.active)) return;

  const derived = policyDerivedBillFields(householdId, childId, template.amountCents);
  const disabledRow = existing.find((b) => !b.active);

  if (disabledRow) {
    db.update(bill)
      .set({
        active: true,
        archivedAt: null,
        syncedWithTemplate: true,
        name: template.name,
        amountCents: template.amountCents,
        cadence: template.cadence,
        dueDay: template.dueDay,
        disposition: template.disposition,
        sourceAccountOrder: template.sourceAccountOrder,
        mayUseEarmarked: template.mayUseEarmarked,
        autopay: template.autopay,
        ...derived,
      })
      .where(eq(bill.id, disabledRow.id))
      .run();
  } else {
    db.insert(bill)
      .values({
        childId,
        templateId,
        syncedWithTemplate: true,
        name: template.name,
        amountCents: template.amountCents,
        cadence: template.cadence,
        dueDay: template.dueDay,
        disposition: template.disposition,
        sourceAccountOrder: template.sourceAccountOrder,
        mayUseEarmarked: template.mayUseEarmarked,
        autopay: template.autopay,
        ...derived,
        effectiveFrom: todayInHousehold(),
      })
      .run();
  }

  generateInstances();
}

export function instantiateBillTemplatesForChild(householdId: string, childId: string): void {
  const templates = listBillTemplates(householdId).filter((t) => t.appliesToNewChildren);
  const today = todayInHousehold();

  for (const t of templates) {
    db.insert(bill)
      .values({
        childId,
        templateId: t.id,
        syncedWithTemplate: true,
        name: t.name,
        amountCents: t.amountCents,
        cadence: t.cadence,
        dueDay: t.dueDay,
        disposition: t.disposition,
        sourceAccountOrder: t.sourceAccountOrder,
        mayUseEarmarked: t.mayUseEarmarked,
        autopay: t.autopay,
        ...policyDerivedBillFields(householdId, childId, t.amountCents),
        effectiveFrom: today,
      })
      .run();
  }

  if (templates.length > 0) generateInstances();
}

export function billTemplateChildStatus(householdId: string, templateId: string) {
  const children = listChildren(householdId);
  const rows = db.select().from(bill).where(eq(bill.templateId, templateId)).all();

  return children.map((c) => {
    const row = rows.find((r) => r.childId === c.id && r.active);
    return {
      childId: c.id,
      childName: c.displayName,
      enabled: !!row,
      customized: row ? !row.syncedWithTemplate : false,
      amountCents: row?.amountCents ?? null,
      billId: row?.id ?? null,
      cadence: row?.cadence ?? null,
      dueDay: row?.dueDay ?? null,
    };
  });
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

export function setBillTemplateAppliesToNewChildren(
  householdId: string,
  templateId: string,
  value: boolean,
): void {
  db.update(billTemplate)
    .set({ appliesToNewChildren: value })
    .where(and(eq(billTemplate.id, templateId), eq(billTemplate.householdId, householdId)))
    .run();
}

/** Puts a customized bill back on its family template's values. */
export function resyncBill(billId: string): void {
  const row = db.select().from(bill).where(eq(bill.id, billId)).get();
  if (!row?.templateId) return;
  const t = db.select().from(billTemplate).where(eq(billTemplate.id, row.templateId)).get();
  if (!t) return;
  db.update(bill)
    .set({
      syncedWithTemplate: true,
      name: t.name,
      amountCents: t.amountCents,
      cadence: t.cadence,
      dueDay: t.dueDay,
      disposition: t.disposition,
      sourceAccountOrder: t.sourceAccountOrder,
      mayUseEarmarked: t.mayUseEarmarked,
      autopay: t.autopay,
    })
    .where(eq(bill.id, billId))
    .run();
  generateInstances();
}
