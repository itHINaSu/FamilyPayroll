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
const {
  coveredPeriodFor,
  discardStaleDrafts,
  draftPaystub,
  postPaystub,
  runPayrollCycle,
  unpaidPeriods,
} = await import("@/lib/payroll");
const { savePolicyChanges } = await import("@/lib/policy");
const { previewPayChoices } = await import("@/lib/policy-schedule");
const { evaluatePeriod } = await import("@/lib/responsibilities");

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

/** Whether the period starting on `startDate` has been posted. */
function postedOn(childId: string, startDate: string) {
  return db
    .select()
    .from(schema.payPeriod)
    .where(eq(schema.payPeriod.childId, childId))
    .all()
    .some((p) => p.startDate === startDate && p.status === "posted");
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

  it("switching from this period on a Saturday: the short week that just ended pays then", () => {
    const { householdId, childId } = setup();
    runDays("2026-10-05", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-12");
    // Mon Oct 12 – Fri Oct 16 has ended under the new schedule: it's its own
    // short week, due now — not folded into the week that started today.
    expect(unpaidPeriods(householdId, childId, "2026-10-17")).toMatchObject([
      { startDate: "2026-10-12", endDate: "2026-10-16", payDate: "2026-10-17" },
      { startDate: "2026-10-17", endDate: "2026-10-23", payDate: "2026-10-24" },
    ]);
    runPayrollCycle("2026-10-17", { householdId }); // what saving the change does
    runDays("2026-10-18", "2026-11-01");
    expect(periods(childId)).toEqual([
      "2026-09-28..2026-10-04 paid 2026-10-05",
      "2026-10-05..2026-10-11 paid 2026-10-12",
      "2026-10-12..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
    expect(postedOn(childId, "2026-10-12")).toBe(true);
    expectContiguous(childId);
  });

  it("first week, Sunday weeks to Saturday weeks on a Saturday: that week pays that day", () => {
    // Payroll started Sat Oct 10 on Sunday weeks, so the first period was
    // Oct 10 – 17, paid Sun Oct 18. On Sat Oct 17 the schedule moves to
    // Saturday weeks from this period.
    const { householdId, childId } = setup({ startedOn: "2026-10-10" });
    savePolicyChanges({
      scopeType: "household",
      scopeId: householdId,
      effectiveFrom: "2026-10-01",
      changes: [{ kind: "set", path: "pay.periodStartDay", value: 0 }],
    });
    runDays("2026-10-10", "2026-10-17");
    expect(coveredPeriodFor(householdId, childId, "2026-10-17")).toMatchObject({
      startDate: "2026-10-10",
      endDate: "2026-10-17",
      payDate: "2026-10-18",
    });
    toSaturdayWeeks(householdId, "2026-10-10");
    expect(coveredPeriodFor(householdId, childId, "2026-10-17")).toMatchObject({
      startDate: "2026-10-17",
      endDate: "2026-10-23",
    });
    expect(runPayrollCycle("2026-10-17", { householdId }).posted).toHaveLength(1);
    runDays("2026-10-18", "2026-10-31");
    expect(periods(childId)).toEqual([
      "2026-10-10..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
  });

  it("previews what each answer does, without saving anything", () => {
    const { householdId, childId } = setup({ startedOn: "2026-10-10" });
    savePolicyChanges({
      scopeType: "household",
      scopeId: householdId,
      effectiveFrom: "2026-10-01",
      changes: [{ kind: "set", path: "pay.periodStartDay", value: 0 }],
    });
    runDays("2026-10-10", "2026-10-17");
    const versionsBefore = db.select().from(schema.policyVersion).all().length;

    const preview = previewPayChoices({
      householdId,
      scopeType: "child",
      scopeId: childId,
      changes: [{ kind: "set", path: "pay.periodStartDay", value: 6 }],
      today: "2026-10-17",
    });
    const lines = (ps: NonNullable<typeof preview>["current"]) =>
      ps.map((p) => `${p.startDate}..${p.endDate} paid ${p.payDate} ${p.days}/${p.usualDays}`);
    expect(lines(preview!.current)).toEqual([
      "2026-10-10..2026-10-16 paid 2026-10-17 7/7",
      "2026-10-17..2026-10-23 paid 2026-10-24 7/7",
      "2026-10-24..2026-10-30 paid 2026-10-31 7/7",
    ]);
    expect(lines(preview!.next)).toEqual([
      "2026-10-10..2026-10-17 paid 2026-10-18 8/7",
      "2026-10-18..2026-10-23 paid 2026-10-24 6/7",
    ]);

    // Rolled back: the schedule is exactly as it was.
    expect(db.select().from(schema.policyVersion).all().length).toBe(versionsBefore);
    expect(coveredPeriodFor(householdId, childId, "2026-10-17")).toMatchObject({
      startDate: "2026-10-10",
      endDate: "2026-10-17",
    });
  });

  it("a whole week the new schedule says has ended pays at the next run if nobody saves", () => {
    const { householdId, childId } = setup({ startedOn: "2026-10-10" });
    savePolicyChanges({
      scopeType: "household",
      scopeId: householdId,
      effectiveFrom: "2026-10-01",
      changes: [{ kind: "set", path: "pay.periodStartDay", value: 0 }],
    });
    runDays("2026-10-10", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-10");
    runDays("2026-10-18", "2026-10-24");
    expect(periods(childId)).toEqual([
      "2026-10-10..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
    ]);
  });

  it("a first pay week reaches back to the day payroll started", () => {
    const { householdId, childId } = setup({ startedOn: "2026-10-14" });
    runDays("2026-10-14", "2026-10-15");
    toSaturdayWeeks(householdId, "2026-10-14");
    // Wed Oct 14 – Fri Oct 16 is only three days: they join the next week.
    expect(coveredPeriodFor(householdId, childId, "2026-10-15")).toMatchObject({
      startDate: "2026-10-14",
      endDate: "2026-10-23",
      payDate: "2026-10-24",
    });
    runDays("2026-10-16", "2026-10-31");
    expect(periods(childId)).toEqual([
      "2026-10-14..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
  });

  it("never pays a day twice, and tacks a 2-day leftover onto the next week", () => {
    const { householdId, childId } = setup();
    toSaturdayWeeks(householdId, "2026-01-01");
    runDays("2026-10-10", "2026-10-24"); // Saturday weeks, paid through Fri Oct 23
    savePolicyChanges({
      scopeType: "household",
      scopeId: householdId,
      effectiveFrom: "2026-10-24",
      changes: [{ kind: "set", path: "pay.periodStartDay", value: 1 }],
    });
    runDays("2026-10-25", "2026-11-09");
    // Sat Oct 24 and Sun Oct 25 join the next Monday week: one long week.
    expect(periods(childId)).toEqual([
      "2026-10-03..2026-10-09 paid 2026-10-10",
      "2026-10-10..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-11-01 paid 2026-11-02",
      "2026-11-02..2026-11-08 paid 2026-11-09",
    ]);
    expectContiguous(childId);
  });

  it("reaches back at most one extra period", () => {
    const { householdId, childId } = setup();
    runDays("2026-08-31", "2026-09-07"); // paid through Sun Sep 6, then nothing
    expect(unpaidPeriods(householdId, childId, "2026-10-14")).toMatchObject([
      { startDate: "2026-10-05", endDate: "2026-10-11" },
      { startDate: "2026-10-12", endDate: "2026-10-18" },
    ]);
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

  it("a waiting draft from the old schedule is replaced (this period)", () => {
    const { householdId, childId } = setup({ startedOn: "2026-10-12" });
    runDays("2026-10-12", "2026-10-16");
    // Draft now, Friday, under the Monday schedule.
    draftPaystub(householdId, childId, "2026-10-12", "2026-10-18", "2026-10-19");
    runDays("2026-10-17", "2026-10-17");
    toSaturdayWeeks(householdId, "2026-10-12");
    // Saving the change drops the stale draft, so it can't be posted by hand.
    expect(discardStaleDrafts(householdId)).toBe(1);
    expect(periods(childId)).toEqual([]);
    runDays("2026-10-18", "2026-10-31");
    expect(periods(childId)).toEqual([
      "2026-10-12..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
      "2026-10-24..2026-10-30 paid 2026-10-31",
    ]);
  });

  it("a too-long draft that ends on schedule is still replaced", () => {
    // Drafted while one transition period swallowed the week before it.
    const { householdId, childId } = setup({ startedOn: "2026-10-10" });
    toSaturdayWeeks(householdId, "2026-10-01");
    draftPaystub(householdId, childId, "2026-10-10", "2026-10-23", "2026-10-24");
    expect(discardStaleDrafts(householdId)).toBe(1);
    runDays("2026-10-17", "2026-10-24");
    expect(periods(childId)).toEqual([
      "2026-10-10..2026-10-16 paid 2026-10-17",
      "2026-10-17..2026-10-23 paid 2026-10-24",
    ]);
  });

  it("a week paid early isn't offered again, and isn't paid twice", () => {
    const { householdId, childId } = setup();
    runDays("2026-10-12", "2026-10-14");
    const stub = draftPaystub(householdId, childId, "2026-10-12", "2026-10-18", "2026-10-19");
    postPaystub(stub);
    expect(unpaidPeriods(householdId, childId, "2026-10-14")).toEqual([]);
    expect(coveredPeriodFor(householdId, childId, "2026-10-14")).toMatchObject({
      startDate: "2026-10-12",
      endDate: "2026-10-18",
      alreadyPaid: true,
    });
    runDays("2026-10-15", "2026-10-26");
    expect(periods(childId).slice(-2)).toEqual([
      "2026-10-12..2026-10-18 paid 2026-10-19",
      "2026-10-19..2026-10-25 paid 2026-10-26",
    ]);
  });

  it("every-two-weeks periods hold still from day to day", () => {
    const { householdId, childId } = setup();
    savePolicyChanges({
      scopeType: "household",
      scopeId: householdId,
      effectiveFrom: "2026-01-01",
      changes: [{ kind: "set", path: "pay.cadence", value: "biweekly" }],
    });
    const seen = new Set<string>();
    for (let d = "2026-10-05"; d <= "2026-10-18"; d = addDays(d, 1)) {
      const p = coveredPeriodFor(householdId, childId, d);
      seen.add(`${p.startDate}..${p.endDate}`);
    }
    expect(seen.size).toBeLessThanOrEqual(2);
    runDays("2026-09-01", "2026-11-01");
    const rows = periods(childId);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expectContiguous(childId);
    for (const r of rows.slice(1)) {
      const [start, end] = r.split(" ")[0].split("..");
      expect(addDays(start, 13)).toBe(end);
    }
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

  it("tacks days that would be skipped onto the next week (a long week)", () => {
    const { householdId, childId } = setup();
    runDays("2026-10-05", "2026-10-20"); // Monday weeks, paid through Sun Oct 18
    // Tuesday Oct 20: switch to Wednesday-start weeks, this pay period.
    savePolicyChanges({
      scopeType: "household",
      scopeId: householdId,
      effectiveFrom: "2026-10-19",
      changes: [{ kind: "set", path: "pay.periodStartDay", value: 3 }],
    });
    expect(coveredPeriodFor(householdId, childId, "2026-10-20")).toMatchObject({
      startDate: "2026-10-19",
      endDate: "2026-10-27",
      payDate: "2026-10-28",
    });
    runDays("2026-10-21", "2026-11-04");
    expect(periods(childId).slice(-3)).toEqual([
      "2026-10-12..2026-10-18 paid 2026-10-19",
      "2026-10-19..2026-10-27 paid 2026-10-28",
      "2026-10-28..2026-11-03 paid 2026-11-04",
    ]);
    expectContiguous(childId);
  });
});

describe("what a short or long week pays", () => {
  function expectation(
    childId: string,
    cadence: "daily" | "daily_selected" | "weekly" | "up_to_n",
    weeklyValueCents: number,
    extra: { daysOfWeek?: number[]; maxOccurrences?: number } = {},
  ) {
    return db
      .insert(schema.responsibility)
      .values({
        childId,
        name: cadence,
        weeklyValueCents,
        cadence,
        daysOfWeek: extra.daysOfWeek ?? null,
        maxOccurrences: extra.maxOccurrences ?? null,
        payMode: "expected",
        effectiveFrom: "2026-01-01",
      })
      .returning()
      .get();
  }

  function potential(r: ReturnType<typeof expectation>, childId: string, start: string, end: string) {
    return evaluatePeriod(r, childId, start, end, "auto_approve_with_veto", "2026-12-31", {
      valuation: "weeks",
    }).potentialCents;
  }

  it("prorates day-based expectations and pays weekly ones in full", () => {
    const { childId } = setup();
    const daily = expectation(childId, "daily", 700); // $1 a day
    const mwf = expectation(childId, "daily_selected", 300, { daysOfWeek: [1, 3, 5] }); // $1 a time
    const weekly = expectation(childId, "weekly", 400);
    const upTo = expectation(childId, "up_to_n", 600, { maxOccurrences: 3 });

    // A normal week: everything at its weekly value.
    expect([daily, mwf, weekly, upTo].map((r) => potential(r, childId, "2026-10-17", "2026-10-23"))).toEqual([
      700, 300, 400, 600,
    ]);
    // Short week, Mon Oct 19 – Fri Oct 23: daily 5 days; M/W/F all three; weekly and up-to-N in full.
    expect([daily, mwf, weekly, upTo].map((r) => potential(r, childId, "2026-10-19", "2026-10-23"))).toEqual([
      500, 300, 400, 600,
    ]);
    // Long week, Mon Oct 19 – Tue Oct 27: daily 9 days; M/W/F four times; weekly and up-to-N once.
    expect([daily, mwf, weekly, upTo].map((r) => potential(r, childId, "2026-10-19", "2026-10-27"))).toEqual([
      900, 400, 400, 600,
    ]);
    // A short week plus a full one, Mon Oct 12 – Fri Oct 23: each week's weekly items in full.
    expect([daily, mwf, weekly, upTo].map((r) => potential(r, childId, "2026-10-12", "2026-10-23"))).toEqual([
      1200, 600, 800, 1200,
    ]);
  });

  it("splits a short-plus-full period into the short week first", () => {
    const { childId } = setup();
    const daily = expectation(childId, "daily", 700);
    const weeks = evaluatePeriod(daily, childId, "2026-10-12", "2026-10-23", "auto_approve_with_veto", "2026-12-31", {
      valuation: "weeks",
    }).weeks.map((w) => `${w.start}..${w.end}`);
    expect(weeks).toEqual(["2026-10-12..2026-10-16", "2026-10-17..2026-10-23"]);
  });
});
