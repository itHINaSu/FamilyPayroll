import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { bill, billTemplate, child, responsibility, responsibilityTemplate } from "@/db/schema";

/**
 * Every expectation and bill belongs to a family entry in Setup, which is
 * the only place they're managed. Rows made before that rule (on a child's
 * own page, or by an age preset) are attached here: to an existing family
 * entry with the same name, or to a new one given only to that child.
 * A row whose values differ from its entry is marked customized.
 * Idempotent — rows already attached are left alone.
 */
export function adoptOrphans(householdId?: string): void {
  const households = householdId
    ? [householdId]
    : [...new Set(db.select({ h: child.householdId }).from(child).all().map((r) => r.h))];

  for (const h of households) {
    adoptResponsibilities(h);
    adoptBills(h);
  }
}

const key = (name: string) => name.trim().toLowerCase();

function adoptResponsibilities(householdId: string) {
  const orphans = db
    .select({ r: responsibility })
    .from(responsibility)
    .innerJoin(child, eq(child.id, responsibility.childId))
    .where(and(eq(child.householdId, householdId), isNull(responsibility.templateId)))
    .all()
    .map((x) => x.r);
  if (orphans.length === 0) return;

  const templates = db
    .select()
    .from(responsibilityTemplate)
    .where(eq(responsibilityTemplate.householdId, householdId))
    .all();

  for (const r of orphans) {
    let t = templates.find((x) => x.active && key(x.name) === key(r.name));
    if (!t) {
      t = db
        .insert(responsibilityTemplate)
        .values({
          householdId,
          name: r.name,
          icon: r.icon,
          weeklyValueCents: r.weeklyValueCents,
          cadence: r.cadence,
          daysOfWeek: r.daysOfWeek,
          maxOccurrences: r.maxOccurrences,
          payMode: r.payMode,
          allOrNothing: r.allOrNothing,
          appliesToNewChildren: false,
          active: r.active,
          archivedAt: r.archivedAt,
          sortOrder: r.sortOrder,
        })
        .returning()
        .get();
      templates.push(t);
    }

    const same =
      t.weeklyValueCents === r.weeklyValueCents &&
      t.cadence === r.cadence &&
      JSON.stringify(t.daysOfWeek ?? null) === JSON.stringify(r.daysOfWeek ?? null) &&
      (t.maxOccurrences ?? null) === (r.maxOccurrences ?? null) &&
      t.payMode === r.payMode &&
      t.allOrNothing === r.allOrNothing;

    db.update(responsibility)
      .set({ templateId: t.id, syncedWithTemplate: same })
      .where(eq(responsibility.id, r.id))
      .run();
  }
}

function adoptBills(householdId: string) {
  const orphans = db
    .select({ b: bill })
    .from(bill)
    .innerJoin(child, eq(child.id, bill.childId))
    .where(and(eq(child.householdId, householdId), isNull(bill.templateId)))
    .all()
    .map((x) => x.b);
  if (orphans.length === 0) return;

  const templates = db
    .select()
    .from(billTemplate)
    .where(eq(billTemplate.householdId, householdId))
    .all();

  for (const b of orphans) {
    let t = templates.find((x) => x.active && key(x.name) === key(b.name));
    if (!t) {
      t = db
        .insert(billTemplate)
        .values({
          householdId,
          name: b.name,
          amountCents: b.amountCents,
          cadence: b.cadence,
          dueDay: b.dueDay,
          disposition: b.disposition,
          sourceAccountOrder: b.sourceAccountOrder,
          mayUseEarmarked: b.mayUseEarmarked,
          autopay: b.autopay,
          appliesToNewChildren: false,
          active: b.active,
          archivedAt: b.archivedAt,
        })
        .returning()
        .get();
      templates.push(t);
    }

    const same =
      t.amountCents === b.amountCents &&
      t.cadence === b.cadence &&
      t.dueDay === b.dueDay &&
      t.disposition === b.disposition;

    db.update(bill)
      .set({ templateId: t.id, syncedWithTemplate: same })
      .where(eq(bill.id, b.id))
      .run();
  }
}
