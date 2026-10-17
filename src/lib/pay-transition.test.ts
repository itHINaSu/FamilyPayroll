/**
 * Changing the pay schedule: periods follow what has actually been paid, so a
 * switch (Monday weeks to Saturday weeks, say) never skips a day or pays one
 * twice. Each test replays the daily payroll run day by day.
 */

import { describe, expect, it } from "vitest";

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const schema = await import("@/db/schema");
const { addDays } = await import("@/lib/dates");
const { createChild } = await import("@/lib/children");
const { coveredPeriodFor, discardStaleDrafts, draftPaystub, runPayrollCycle } = await import(
  "@/lib/payroll"
);
const { savePolicyChanges } = await import("@/lib/policy");

function setup(opts: { startedOn?: string } = {}) {
  const householdId = db
    .insert(schema.household)
    .values({
      name: `Test ${crypto.randomUUID().slice(0, 6)}`,
      timezone: "UTC",
      payrollResumedOn: opts.startedOn ?? null,
    })
    .returning({ id: schema.household.id })
    .get().id;
  // Monday-start weeks, paid the next morning.
  savePolicyChanges({
    scopeType: "household",
    scopeId: householdId,
    effectiveFrom: "2026-01-01",
    changes: [
      { kind: "set", path: "pay.cadence", value: "weekly" },
      { kind: "set", path: "pay.periodStartDay", value: 1 },
      { kind: "set", path: "pay.payDateOffsetDays", value: 1 },
    ],
  });
  const childId = createChild({
    householdId,
    displayName: "Sam",
    birthdate: "2016-01-01",
    status: "active",
  });
  // createChild may add starter rows; only this household's child matters.
  db.update(schema.child)
    .set({ status: "archived" })
    .where(eq(schema.child.status, "active"))
    .run();
  db.update(schema.child).set({ status: "active" }).where(eq(schema.child.id, childId)).run();
  return { householdId, childId };
}

function runDays(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) runPayrollCycle(d);
}

function toSaturdayWeeks(householdId: string, effectiveFrom: string) {
  savePolicyChanges({
    scopeType: "household",
    scopeId: householdId,
    effectiveFrom,
    changes: [{ kind: "set", path: "pay.periodStartDay", value: 6 }],
  });
}

function periods(childId: string) {
  return db
    .select()
    .from(schema.payPeriod)
    .where(eq(schema.payPeriod.childId, childId))
    .all()
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((p) => `${p.startDate}..${p.endDate} paid ${p.payDate}`);
}

/** Every period starts the day after the one before it ends. */
function expectContiguous(childId: string) {
  const rows = db
    .select()
    .from(schema.payPeriod)
    .where(eq(schema.payPeriod.childId, childId))
    .all()
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].startDate).toBe(addDays(rows[i - 1].endDate, 1));
  }
}

describe("pay schedule changes", () => {
  it("leaves an established schedule exactly as it was", () => {
    const { childId } = setup();
    runDays("2026-09-28", "2026-10-26");
    expect(periods(childId)).toEqual([
      "2026-09-21..2026-09-27 paid 2026-09-28",
      "2026-09-28..2026-10-04 paid 2026-10-05",
      "2026-10-05..2026-10-11 paid 2026-10-12",
      "2026-10-12..2026-10-18 paid 2026-10-19",
      "2026-10-19..2026-10-25 paid 2026-10-26",
    ]);
  });

  it("switching from next period: a short transition week, nothing skipped", () => {
    const { householdId, childId } = setup();
    runDays("2026-10-05", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-19");
    runDays("2026-10-18", "2026-11-01");
    expect(periods(childId)).toEqual([
      "2026-09-28..2026-10-04 paid 2026-10-05",
      "2026-10-05..2026-10-11 paid 2026-10-12",
      "2026-10-12..2026-10-18 paid 2026-10-19",
      "2026-10-19..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
    expectContiguous(childId);
  });

  it("switching from this period: the unpaid days roll into the first new week", () => {
    const { householdId, childId } = setup();
    runDays("2026-10-05", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-12");
    runDays("2026-10-18", "2026-11-01");
    expect(periods(childId)).toEqual([
      "2026-09-28..2026-10-04 paid 2026-10-05",
      "2026-10-05..2026-10-11 paid 2026-10-12",
      "2026-10-12..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
    expectContiguous(childId);
  });

  it("a first pay week reaches back to the day payroll started", () => {
    const { householdId, childId } = setup({ startedOn: "2026-10-12" });
    runDays("2026-10-12", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-12");
    expect(coveredPeriodFor(householdId, childId, "2026-10-17")).toMatchObject({
      startDate: "2026-10-12",
      endDate: "2026-10-23",
      payDate: "2026-10-24",
    });
    runDays("2026-10-18", "2026-10-31");
    expect(periods(childId)).toEqual([
      "2026-10-12..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
  });

  it("never pays a day twice when switching after paying ahead", () => {
    const { householdId, childId } = setup();
    toSaturdayWeeks(householdId, "2026-01-01");
    runDays("2026-10-10", "2026-10-24"); // Saturday weeks, paid through Fri Oct 23
    savePolicyChanges({
      scopeType: "household",
      scopeId: householdId,
      effectiveFrom: "2026-10-24",
      changes: [{ kind: "set", path: "pay.periodStartDay", value: 1 }],
    });
    runDays("2026-10-25", "2026-11-02");
    expect(periods(childId)).toEqual([
      "2026-10-03..2026-10-09 paid 2026-10-10",
      "2026-10-10..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-25 paid 2026-10-26",
      "2026-10-26..2026-11-01 paid 2026-11-02",
    ]);
    expectContiguous(childId);
  });

  it("reaches back at most one extra period", () => {
    const { householdId, childId } = setup();
    runDays("2026-08-31", "2026-09-07"); // paid through Sun Sep 6, then nothing
    expect(coveredPeriodFor(householdId, childId, "2026-10-14").startDate).toBe("2026-10-05");
  });

  it("replaces a stale draft over the same days instead of paying it as well", () => {
    const { householdId, childId } = setup();
    runDays("2026-10-05", "2026-10-14");
    toSaturdayWeeks(householdId, "2026-10-12");
    // A draft for the bare Saturday week, overlapping days already paid.
    draftPaystub(householdId, childId, "2026-10-10", "2026-10-16", "2026-10-17");
    runDays("2026-10-15", "2026-10-31");
    expect(periods(childId)).toEqual([
      "2026-09-28..2026-10-04 paid 2026-10-05",
      "2026-10-05..2026-10-11 paid 2026-10-12",
      "2026-10-12..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
    expectContiguous(childId);
  });

  it("a waiting draft from the old schedule rolls into the first new week (this period)", () => {
    const { householdId, childId } = setup({ startedOn: "2026-10-12" });
    runDays("2026-10-12", "2026-10-16");
    // Draft now, Friday, under the Monday schedule.
    draftPaystub(householdId, childId, "2026-10-12", "2026-10-18", "2026-10-19");
    runDays("2026-10-17", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-12");
    expect(coveredPeriodFor(householdId, childId, "2026-10-17")).toMatchObject({
      startDate: "2026-10-12",
      endDate: "2026-10-23",
    });
    // Saving the change drops the stale draft, so it can't be posted by hand.
    expect(discardStaleDrafts(householdId)).toBe(1);
    expect(periods(childId)).toEqual([]);
    runDays("2026-10-18", "2026-10-31");
    expect(periods(childId)).toEqual([
      "2026-10-12..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
  });

  it("a waiting draft still pays as planned when the change starts next period", () => {
    const { householdId, childId } = setup({ startedOn: "2026-10-12" });
    runDays("2026-10-12", "2026-10-16");
    draftPaystub(householdId, childId, "2026-10-12", "2026-10-18", "2026-10-19");
    runDays("2026-10-17", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-19");
    expect(discardStaleDrafts(householdId)).toBe(0); // still on schedule
    runDays("2026-10-18", "2026-10-31");
    expect(periods(childId)).toEqual([
      "2026-10-12..2026-10-18 paid 2026-10-19",
      "2026-10-19..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
  });
});
