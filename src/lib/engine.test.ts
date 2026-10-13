/**
 * Payroll, bills, and interest, against a real database.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-engine-"));
  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
  process.env.TZ = "America/Chicago";
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { eq, and } = await import("drizzle-orm");
const { db } = await import("@/db");
const schema = await import("@/db/schema");
const { createChild } = await import("@/lib/children");
const { getBalances, recordTransaction } = await import("@/lib/ledger");
const { computeDraft, draftPaystub, postPaystub } = await import("@/lib/payroll");
const { evaluatePeriod, toggleBox } = await import("@/lib/responsibilities");
const { collectBill, generateInstances, listBills, runBillCycle, upcomingBills } = await import(
  "@/lib/bills"
);
const { accrueDaily, postMonthlyInterest, lifetimeInterestCents } = await import(
  "@/lib/interest"
);
const { earmark, listGoals, unearmark } = await import("@/lib/goals");
const { savePolicyVersion, resolvePolicy, checkGuardrails, DEFAULT_POLICY } =
  await import("@/lib/policy");

let householdId: string;
let childId: string;

beforeAll(() => {
  householdId = db
    .insert(schema.household)
    .values({ name: "Test", timezone: "America/Chicago" })
    .returning({ id: schema.household.id })
    .get().id;
});

beforeEach(() => {
  childId = createChild({
    householdId,
    displayName: `Kid ${crypto.randomUUID().slice(0, 6)}`,
    birthdate: "2019-04-01",
    status: "active",
  });
});

function addResponsibility(overrides: Partial<typeof schema.responsibility.$inferInsert>) {
  return db
    .insert(schema.responsibility)
    .values({
      childId,
      name: "Make your bed",
      weeklyValueCents: 350,
      cadence: "daily",
      effectiveFrom: "2020-01-01",
      payMode: "optional",
      ...overrides,
    })
    .returning({ id: schema.responsibility.id })
    .get().id;
}

function complete(responsibilityId: string, dates: string[]) {
  for (const date of dates) {
    db.insert(schema.completion)
      .values({
        responsibilityId,
        childId,
        occurrenceDate: date,
        status: "claimed",
      })
      .run();
  }
}

function miss(responsibilityId: string, dates: string[]) {
  for (const date of dates) {
    db.insert(schema.completion)
      .values({ responsibilityId, childId, occurrenceDate: date, status: "missed" })
      .run();
  }
}

const WEEK = { start: "2026-03-02", end: "2026-03-08", payDate: "2026-03-13" };
const WEEK_DATES = [
  "2026-03-02",
  "2026-03-03",
  "2026-03-04",
  "2026-03-05",
  "2026-03-06",
  "2026-03-07",
  "2026-03-08",
];

describe("payroll draft", () => {
  it("pays the full weekly value for a perfect week", () => {
    const r = addResponsibility({});
    complete(r, WEEK_DATES);

    const draft = computeDraft(householdId, childId, WEEK.start, WEEK.end);
    expect(draft.potentialCents).toBe(350);
    expect(draft.earnedCents).toBe(350);
  });

  it("pays proportionally for a partial week", () => {
    const r = addResponsibility({});
    complete(r, WEEK_DATES.slice(0, 5));

    const draft = computeDraft(householdId, childId, WEEK.start, WEEK.end);
    expect(draft.potentialCents).toBe(350);
    expect(draft.earnedCents).toBe(250);
  });

  it("allocates exactly, with the remainder to the designated bucket", () => {
    const r = addResponsibility({ weeklyValueCents: 1751 });
    complete(r, WEEK_DATES);

    const draft = computeDraft(householdId, childId, WEEK.start, WEEK.end);
    const sum =
      draft.allocations.checking +
      draft.allocations.savings +
      draft.allocations.generosity;

    expect(sum).toBe(draft.netCents); // invariant I3
    expect(draft.allocations.checking).toBe(1051); // 60% + the leftover cent
  });

  it("credits an excused day as done, so it never costs pay", () => {
    const r = addResponsibility({});
    complete(r, WEEK_DATES.slice(0, 5)); // Mon–Fri done

    db.insert(schema.excusal)
      .values({
        childId,
        startDate: "2026-03-07",
        endDate: "2026-03-08",
        reason: "At grandma's",
        scope: "all",
      })
      .run();

    const draft = computeDraft(householdId, childId, WEEK.start, WEEK.end);

    // Two days excused, five done: the full week is paid.
    expect(draft.potentialCents).toBe(350);
    expect(draft.earnedCents).toBe(350);
  });

  it("keep it: starts fully paid and only a marked miss docks it", () => {
    const r = addResponsibility({ payMode: "expected", weeklyValueCents: 700 });
    const clean = computeDraft(householdId, childId, WEEK.start, WEEK.end);
    expect(clean.earnedCents).toBe(700);

    miss(r, ["2026-03-03", "2026-03-05"]);
    const docked = computeDraft(householdId, childId, WEEK.start, WEEK.end);
    expect(docked.potentialCents).toBe(700);
    expect(docked.earnedCents).toBe(500);
  });

  it("keep it: a miss on an excused day costs nothing", () => {
    const r = addResponsibility({ payMode: "expected", weeklyValueCents: 700 });
    db.insert(schema.excusal)
      .values({ childId, startDate: "2026-03-04", endDate: "2026-03-04", scope: "all" })
      .run();
    miss(r, ["2026-03-04"]);
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(700);
  });

  it("all or nothing: one miss loses the week's whole value", () => {
    const r = addResponsibility({ payMode: "expected", allOrNothing: true, weeklyValueCents: 100 });
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(100);
    miss(r, ["2026-03-06"]);
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(0);
  });

  it("all or nothing is judged per week across a two-week period", () => {
    const r = addResponsibility({ payMode: "expected", allOrNothing: true, weeklyValueCents: 100 });
    miss(r, ["2026-03-10"]); // second week only
    const draft = computeDraft(householdId, childId, "2026-03-02", "2026-03-15");
    expect(draft.potentialCents).toBe(200);
    expect(draft.earnedCents).toBe(100);
  });

  it("earn it + all or nothing: pays only when every day is checked off", () => {
    const r = addResponsibility({ allOrNothing: true, weeklyValueCents: 100 });
    complete(r, WEEK_DATES.slice(0, 6));
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(0);
    complete(r, WEEK_DATES.slice(6));
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(100);
  });

  it("once a week, any day: earn it on whichever day it gets done", () => {
    const r = addResponsibility({ cadence: "weekly", weeklyValueCents: 300 });
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(0);
    complete(r, ["2026-03-07"]); // Saturday
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(300);
  });

  it("once a week, any day: keep it loses the week on a miss marked any day", () => {
    const r = addResponsibility({ cadence: "weekly", payMode: "expected", weeklyValueCents: 100 });
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(100);
    miss(r, ["2026-03-05"]); // Thursday
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(0);
  });

  it("once a week over two weeks: each week stands alone", () => {
    const r = addResponsibility({ cadence: "weekly", payMode: "expected", weeklyValueCents: 100 });
    miss(r, ["2026-03-12"]);
    const draft = computeDraft(householdId, childId, "2026-03-02", "2026-03-15");
    expect(draft.potentialCents).toBe(200);
    expect(draft.earnedCents).toBe(100);
  });

  it("N times a week can be keep it: each miss docks one of N", () => {
    const r = addResponsibility({
      cadence: "up_to_n",
      maxOccurrences: 3,
      payMode: "expected",
      weeklyValueCents: 300,
    });
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(300);
    miss(r, ["2026-03-04"]);
    expect(computeDraft(householdId, childId, WEEK.start, WEEK.end).earnedCents).toBe(200);
  });

  it("carries miss notes onto the pay stub line", () => {
    const r = addResponsibility({ payMode: "expected", weeklyValueCents: 700 });
    db.insert(schema.completion)
      .values({
        responsibilityId: r,
        childId,
        occurrenceDate: "2026-03-03",
        status: "missed",
        note: "Left it for later and forgot",
      })
      .run();
    const line = computeDraft(householdId, childId, WEEK.start, WEEK.end).lines.find(
      (l) => l.refId === r,
    )!;
    expect(line.detail).toMatchObject({
      missed: 1,
      misses: [{ date: "2026-03-03", note: "Left it for later and forgot" }],
    });
  });

  it("lays out a week of boxes: day letters for daily, numbers for N a week", () => {
    const daily = addResponsibility({ payMode: "expected" });
    const nTimes = addResponsibility({ cadence: "up_to_n", maxOccurrences: 2 });
    const rows = db.select().from(schema.responsibility).all();
    const evalFor = (id: string) =>
      evaluatePeriod(rows.find((x) => x.id === id)!, childId, WEEK.start, WEEK.end, "auto_approve_with_veto", "2026-03-04");

    const d = evalFor(daily).weeks[0].boxes;
    expect(d.map((b) => b.label).join("")).toBe("MTWRFSS");
    expect(d.filter((b) => b.future).length).toBe(4); // Thu–Sun after "today" Wed
    expect(d.every((b) => b.state === "met")).toBe(true);

    const n = evalFor(nTimes).weeks[0].boxes;
    expect(n.map((b) => b.label)).toEqual(["1", "2"]);
    expect(n.every((b) => b.state === "open")).toBe(true);
  });

  it("toggleBox: unchecking keep-it records a miss, re-checking removes it", () => {
    const r = addResponsibility({ cadence: "weekly", payMode: "expected" });
    const base = {
      childId,
      responsibilityId: r,
      date: WEEK.start,
      weekEnd: WEEK.end,
      parentId: "p",
      completionMode: "auto_approve_with_veto" as const,
    };
    const { missId } = toggleBox({ ...base, checked: true });
    expect(missId).toBeTruthy();
    const misses = () =>
      db.select().from(schema.completion).where(eq(schema.completion.responsibilityId, r)).all();
    expect(misses().map((m) => m.status)).toEqual(["missed"]);

    expect(toggleBox({ ...base, checked: false }).missId).toBeNull();
    expect(misses()).toHaveLength(0);
  });

  it("honours a selected-days cadence", () => {
    const r = addResponsibility({
      name: "Trash out",
      cadence: "daily_selected",
      daysOfWeek: [2, 5], // Tuesday and Friday
      weeklyValueCents: 200,
    });
    complete(r, ["2026-03-03"]); // Tuesday only

    const draft = computeDraft(householdId, childId, WEEK.start, WEEK.end);
    expect(draft.potentialCents).toBe(200);
    expect(draft.earnedCents).toBe(100);
  });

  it("treats up-to-N as opportunity rather than a miss", () => {
    const r = addResponsibility({
      name: "Vacuum",
      cadence: "up_to_n",
      maxOccurrences: 3,
      weeklyValueCents: 300,
    });
    complete(r, ["2026-03-03", "2026-03-05"]);

    const draft = computeDraft(householdId, childId, WEEK.start, WEEK.end);
    expect(draft.earnedCents).toBe(200);
  });
});

describe("payroll posting", () => {
  it("writes nothing to the ledger until posted", () => {
    const r = addResponsibility({});
    complete(r, WEEK_DATES);

    const stubId = draftPaystub(
      householdId,
      childId,
      WEEK.start,
      WEEK.end,
      WEEK.payDate,
    );

    expect(getBalances(childId).visibleTotal).toBe(0);

    postPaystub(stubId);
    expect(getBalances(childId).visibleTotal).toBe(350);
  });

  it("is idempotent — posting twice does not pay twice", () => {
    const r = addResponsibility({});
    complete(r, WEEK_DATES);

    const stubId = draftPaystub(householdId, childId, WEEK.start, WEEK.end, WEEK.payDate);
    postPaystub(stubId);
    postPaystub(stubId);

    expect(getBalances(childId).visibleTotal).toBe(350);
  });

  it("recomputes a draft in place rather than creating a second one", () => {
    const r = addResponsibility({});
    complete(r, WEEK_DATES.slice(0, 3));

    const first = draftPaystub(householdId, childId, WEEK.start, WEEK.end, WEEK.payDate);
    complete(r, WEEK_DATES.slice(3));
    const second = draftPaystub(householdId, childId, WEEK.start, WEEK.end, WEEK.payDate);

    expect(second).toBe(first);

    const stub = db.select().from(schema.paystub).where(eq(schema.paystub.id, first)).get();
    expect(stub?.earnedCents).toBe(350);
    expect(stub?.revisionCount).toBe(1);
  });

  it("refuses to redraft a posted period — invariant I5", () => {
    const r = addResponsibility({});
    complete(r, WEEK_DATES);

    const stubId = draftPaystub(householdId, childId, WEEK.start, WEEK.end, WEEK.payDate);
    postPaystub(stubId);

    expect(() =>
      draftPaystub(householdId, childId, WEEK.start, WEEK.end, WEEK.payDate),
    ).toThrow(/already been posted/);
  });
});

describe("bills", () => {
  function addBill(overrides: Partial<typeof schema.bill.$inferInsert> = {}) {
    return db
      .insert(schema.bill)
      .values({
        childId,
        name: "Rent",
        amountCents: 1500,
        cadence: "monthly",
        dueDay: 28,
        disposition: "held_for_child",
        sourceAccountOrder: ["checking"],
        effectiveFrom: "2020-01-01",
        ...overrides,
      })
      .returning({ id: schema.bill.id })
      .get().id;
  }

  it("collects in full and routes the money to the hidden held account", () => {
    addBill();
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 5000,
      type: "cash_deposit",
      description: "seed",
    });

    generateInstances(60, "2026-03-01");
    const instance = db
      .select()
      .from(schema.billInstance)
      .where(eq(schema.billInstance.childId, childId))
      .get();

    collectBill(instance!.id);

    const balances = getBalances(childId);
    expect(balances.checking).toBe(3500);
    expect(balances.held).toBe(1500); // secretly saved
    expect(balances.visibleTotal).toBe(3500); // held excluded — invariant I4
  });

  it("takes what it can and carries the rest as past due", () => {
    addBill();
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 1200,
      type: "cash_deposit",
      description: "seed",
    });

    generateInstances(60, "2026-03-01");
    const instance = db
      .select()
      .from(schema.billInstance)
      .where(eq(schema.billInstance.childId, childId))
      .get();

    const result = collectBill(instance!.id);

    expect(result.collected).toBe(1200);
    expect(result.shortfall).toBe(300);
    expect(getBalances(childId).checking).toBe(0);
  });

  it("protects goal money from a bill by default", () => {
    addBill({ sourceAccountOrder: ["checking", "savings"] });

    recordTransaction({
      childId,
      accountType: "savings",
      amountCents: 4000,
      type: "cash_deposit",
      description: "seed",
    });

    const goalId = db
      .insert(schema.goal)
      .values({ childId, name: "Lego set", targetCents: 4000 })
      .returning({ id: schema.goal.id })
      .get().id;

    earmark(childId, goalId, 4000);

    generateInstances(60, "2026-03-01");
    const instance = db
      .select()
      .from(schema.billInstance)
      .where(eq(schema.billInstance.childId, childId))
      .get();

    const result = collectBill(instance!.id);

    // Everything is spoken for, so the bill collects nothing rather than
    // draining the Lego fund.
    expect(result.collected).toBe(0);
    expect(getBalances(childId).savings).toBe(4000);
  });

  it("computes the shortfall that drives the nudge", () => {
    addBill();
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 1200,
      type: "cash_deposit",
      description: "seed",
    });

    generateInstances(60);
    const upcoming = upcomingBills(childId, 400);
    const rent = upcoming.find((b) => b.billName === "Rent");

    expect(rent).toBeDefined();
    expect(rent!.shortfallCents).toBe(300); // "you have $12, you need $15"
  });

  it("stops showing and stops collecting a bill once it is turned off", () => {
    const billId = addBill();
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 5000,
      type: "cash_deposit",
      description: "seed",
    });

    generateInstances(60, "2026-03-01");
    expect(upcomingBills(childId, 400).some((b) => b.billName === "Rent")).toBe(true);

    // Turning it off is exactly what archiveBill/disableBillTemplateForChild do.
    db.update(schema.bill)
      .set({ active: false, archivedAt: Date.now() })
      .where(eq(schema.bill.id, billId))
      .run();

    // A stale scheduled instance from before the bill was disabled must not
    // still show up or still be collectible — this was a real bug: an
    // already-generated future instance ignored the parent bill's active
    // flag entirely.
    expect(upcomingBills(childId, 400).some((b) => b.billName === "Rent")).toBe(false);

    const before = getBalances(childId).checking;
    runBillCycle("2026-03-28");
    expect(getBalances(childId).checking).toBe(before); // nothing collected
  });
});

describe("interest", () => {
  it("accrues daily and pays once a month", () => {
    recordTransaction({
      childId,
      accountType: "savings",
      amountCents: 4000,
      type: "cash_deposit",
      description: "seed",
    });

    // 30 days at 12% APR on $40 is about 39 cents.
    for (let day = 1; day <= 30; day++) {
      accrueDaily(`2026-04-${String(day).padStart(2, "0")}`);
    }

    expect(getBalances(childId).savings).toBe(4000); // nothing posted yet

    postMonthlyInterest("2026-05-01");

    const balance = getBalances(childId).savings;
    expect(balance).toBeGreaterThan(4000);
    expect(lifetimeInterestCents(childId)).toBe(balance - 4000);
  });

  it("does not accrue twice for the same day", () => {
    recordTransaction({
      childId,
      accountType: "savings",
      amountCents: 4000,
      type: "cash_deposit",
      description: "seed",
    });

    accrueDaily("2026-04-01");
    accrueDaily("2026-04-01");

    const rows = db
      .select()
      .from(schema.interestAccrual)
      .where(eq(schema.interestAccrual.childId, childId))
      .all();

    expect(rows).toHaveLength(1);
  });
});

describe("goals", () => {
  it("earmarks without changing the real savings balance", () => {
    recordTransaction({
      childId,
      accountType: "savings",
      amountCents: 5000,
      type: "cash_deposit",
      description: "seed",
    });

    const goalId = db
      .insert(schema.goal)
      .values({ childId, name: "Lego set", targetCents: 4999 })
      .returning({ id: schema.goal.id })
      .get().id;

    earmark(childId, goalId, 2000);

    const balances = getBalances(childId);
    expect(balances.savings).toBe(5000); // unchanged: the money has not moved
    expect(balances.savingsGeneral).toBe(3000);
    expect(balances.savingsEarmarked).toBe(2000);

    const goals = listGoals(childId);
    expect(goals[0].savedCents).toBe(2000);
    expect(goals[0].progressPct).toBe(40);
  });

  it("refuses to earmark more than is unassigned", () => {
    recordTransaction({
      childId,
      accountType: "savings",
      amountCents: 1000,
      type: "cash_deposit",
      description: "seed",
    });

    const goalId = db
      .insert(schema.goal)
      .values({ childId, name: "Bike", targetCents: 20000 })
      .returning({ id: schema.goal.id })
      .get().id;

    expect(() => earmark(childId, goalId, 2000)).toThrow(/unassigned/);
  });

  it("returns money to the general pot when a goal is broken", () => {
    recordTransaction({
      childId,
      accountType: "savings",
      amountCents: 5000,
      type: "cash_deposit",
      description: "seed",
    });

    const goalId = db
      .insert(schema.goal)
      .values({ childId, name: "Lego set", targetCents: 9999 })
      .returning({ id: schema.goal.id })
      .get().id;

    earmark(childId, goalId, 3000);
    unearmark(childId, goalId, 1000);

    const balances = getBalances(childId);
    expect(balances.savingsGeneral).toBe(3000);
    expect(balances.savingsEarmarked).toBe(2000);
  });
});

describe("policy", () => {
  it("merges a child override over the household default", () => {
    savePolicyVersion({
      scopeType: "household",
      scopeId: householdId,
      payload: { allocation: { checkingPct: 50, savingsPct: 30, generosityPct: 20 } },
      effectiveFrom: "2020-01-01",
    });
    savePolicyVersion({
      scopeType: "child",
      scopeId: childId,
      payload: { allocation: { checkingPct: 40, savingsPct: 40 } },
      effectiveFrom: "2020-01-01",
    });

    const policy = resolvePolicy(householdId, childId, "2026-01-01");
    expect(policy.allocation.checkingPct).toBe(40);
    expect(policy.allocation.savingsPct).toBe(40);
    expect(policy.allocation.generosityPct).toBe(20); // from the household
    expect(policy.pay.cadence).toBe("weekly"); // untouched default
  });

  it("resolves as of a date, so history stays reproducible", () => {
    const scopeId = crypto.randomUUID();
    savePolicyVersion({
      scopeType: "child",
      scopeId,
      payload: { allocation: { checkingPct: 60 } },
      effectiveFrom: "2025-01-01",
    });
    savePolicyVersion({
      scopeType: "child",
      scopeId,
      payload: { allocation: { checkingPct: 70 } },
      effectiveFrom: "2026-01-01",
    });

    expect(resolvePolicy(householdId, scopeId, "2025-06-01").allocation.checkingPct).toBe(60);
    expect(resolvePolicy(householdId, scopeId, "2026-06-01").allocation.checkingPct).toBe(70);
  });

  it("warns when allocations do not total 100", () => {
    const broken = {
      ...DEFAULT_POLICY,
      allocation: { ...DEFAULT_POLICY.allocation, savingsPct: 30 },
    };
    const warnings = checkGuardrails(broken);
    expect(warnings.some((w) => w.field === "allocation")).toBe(true);
  });
});

const { sortChildren, listEarningChildren } = await import("@/lib/children");

describe("child ordering and visibility", () => {

  const rows = [
    { displayName: "Zoe", birthdate: "2015-01-01" },
    { displayName: "Ava", birthdate: "2019-06-15" },
    { displayName: "Milo", birthdate: "2017-03-20" },
  ];

  it("puts the eldest first by default", () => {
    expect(sortChildren(rows).map((r) => r.displayName)).toEqual([
      "Zoe",
      "Milo",
      "Ava",
    ]);
  });

  it("reverses for youngest first", () => {
    expect(sortChildren(rows, "youngest_first").map((r) => r.displayName)).toEqual([
      "Ava",
      "Milo",
      "Zoe",
    ]);
  });

  it("falls back to name for twins", () => {
    const twins = [
      { displayName: "Sam", birthdate: "2019-06-15" },
      { displayName: "Alex", birthdate: "2019-06-15" },
    ];
    expect(sortChildren(twins).map((r) => r.displayName)).toEqual(["Alex", "Sam"]);
  });

  it("hides children who are not yet earning unless asked", () => {
    const pending = createChild({
      householdId,
      displayName: "Newborn",
      birthdate: "2026-01-01",
      status: "pre_participant",
    });

    const hidden = listEarningChildren(householdId);
    expect(hidden.some((c: { id: string }) => c.id === pending)).toBe(false);

    const shown = listEarningChildren(householdId, { showNotYetEarning: true });
    expect(shown.some((c: { id: string }) => c.id === pending)).toBe(true);
  });
});

const { applyAgePreset, copyFromSibling, bandForAge, AGE_PRESETS } = await import(
  "@/lib/seed"
);
const { listResponsibilities } = await import("@/lib/responsibilities");

describe("starter setup — age preset and copy-from-sibling", () => {

  it("fills a new child with the age-band preset", () => {
    const kidId = createChild({
      householdId,
      displayName: "Preset Kid",
      birthdate: "2019-01-01", // lands in the 5-7 band as of 2026
      status: "active",
    });

    const band = bandForAge(7);
    applyAgePreset(kidId, band);

    const responsibilities = listResponsibilities(kidId);
    expect(responsibilities.length).toBe(AGE_PRESETS[band].responsibilities.length);
    expect(responsibilities.map((r) => r.name)).toContain("Make your bed");
  });

  it("copies a sibling's responsibilities rather than the preset", () => {
    const first = createChild({
      householdId,
      displayName: "First",
      birthdate: "2015-01-01",
      status: "active",
    });
    applyAgePreset(first, "11-13");

    const second = createChild({
      householdId,
      displayName: "Second",
      birthdate: "2016-01-01",
      status: "active",
    });
    copyFromSibling(first, second);

    const firstNames = listResponsibilities(first)
      .map((r) => r.name)
      .sort();
    const secondNames = listResponsibilities(second)
      .map((r) => r.name)
      .sort();
    expect(secondNames).toEqual(firstNames);
  });

  it("leaves a blank child with nothing, when asked", () => {
    const kidId = createChild({
      householdId,
      displayName: "Blank Kid",
      birthdate: "2018-01-01",
      status: "active",
    });

    expect(listResponsibilities(kidId)).toEqual([]);
  });
});

const {
  createResponsibilityTemplate,
  updateResponsibilityTemplate,
  archiveResponsibilityTemplate,
  disableTemplateForChild,
  enableTemplateForChild,
  instantiateTemplatesForChild,
  templateChildStatus,
} = await import("@/lib/responsibilities");

describe("family-level responsibility templates", () => {
  it("applies a new template to every existing child", () => {
    const a = createChild({
      householdId,
      displayName: "Template Kid A",
      birthdate: "2015-01-01",
      status: "active",
    });
    const b = createChild({
      householdId,
      displayName: "Template Kid B",
      birthdate: "2013-01-01",
      status: "active",
    });

    const template = createResponsibilityTemplate(householdId, {
      name: "Feed the dog",
      weeklyValueCents: 700,
      cadence: "daily",
    });

    for (const id of [a, b]) {
      const rows = listResponsibilities(id);
      const row = rows.find((r) => r.templateId === template.id);
      expect(row).toBeDefined();
      expect(row!.weeklyValueCents).toBe(700);
      expect(row!.syncedWithTemplate).toBe(true);
    }
  });

  it("propagates a template edit only to children still in sync", () => {
    const a = createChild({
      householdId,
      displayName: "Sync Kid",
      birthdate: "2015-01-01",
      status: "active",
    });
    const b = createChild({
      householdId,
      displayName: "Diverged Kid",
      birthdate: "2013-01-01",
      status: "active",
    });

    const template = createResponsibilityTemplate(householdId, {
      name: "Take out trash",
      weeklyValueCents: 500,
      cadence: "weekly",
    });

    // b customizes their own copy — this is the "modify per child" half.
    const bRow = listResponsibilities(b).find((r) => r.templateId === template.id)!;
    db.update(schema.responsibility)
      .set({ weeklyValueCents: 900, syncedWithTemplate: false })
      .where(eq(schema.responsibility.id, bRow.id))
      .run();

    updateResponsibilityTemplate(template.id, {
      name: "Take out trash",
      weeklyValueCents: 600,
      cadence: "weekly",
    });

    const aRow = listResponsibilities(a).find((r) => r.templateId === template.id)!;
    const bRowAfter = listResponsibilities(b).find((r) => r.templateId === template.id)!;

    expect(aRow.weeklyValueCents).toBe(600); // followed the template
    expect(bRowAfter.weeklyValueCents).toBe(900); // stayed customized
  });

  it("disables and re-enables a template for one child without touching others", () => {
    const a = createChild({
      householdId,
      displayName: "Toggle Kid A",
      birthdate: "2015-01-01",
      status: "active",
    });
    const b = createChild({
      householdId,
      displayName: "Toggle Kid B",
      birthdate: "2013-01-01",
      status: "active",
    });

    const template = createResponsibilityTemplate(householdId, {
      name: "Water the plants",
      weeklyValueCents: 300,
      cadence: "weekly",
    });

    disableTemplateForChild(b, template.id);

    expect(listResponsibilities(a).some((r) => r.templateId === template.id)).toBe(true);
    expect(listResponsibilities(b).some((r) => r.templateId === template.id)).toBe(false);

    enableTemplateForChild(b, template.id);
    const restored = listResponsibilities(b).find((r) => r.templateId === template.id);
    expect(restored).toBeDefined();
    expect(restored!.weeklyValueCents).toBe(300);
    expect(restored!.syncedWithTemplate).toBe(true);
  });

  it("archives every child's row when the template itself is removed", () => {
    const a = createChild({
      householdId,
      displayName: "Archive Kid",
      birthdate: "2015-01-01",
      status: "active",
    });

    const template = createResponsibilityTemplate(householdId, {
      name: "Sweep the porch",
      weeklyValueCents: 250,
      cadence: "weekly",
    });

    archiveResponsibilityTemplate(template.id);

    expect(listResponsibilities(a).some((r) => r.templateId === template.id)).toBe(false);
  });

  it("instantiates every active template for a newly created child", () => {
    createResponsibilityTemplate(householdId, {
      name: "Set the table",
      weeklyValueCents: 400,
      cadence: "daily",
    });

    const lateChild = createChild({
      householdId,
      displayName: "Late Joiner",
      birthdate: "2016-01-01",
      status: "active",
    });
    // The addChild action calls this right after createChild; exercised
    // directly here since createChild itself stays a bare primitive.
    instantiateTemplatesForChild(householdId, lateChild);

    expect(listResponsibilities(lateChild).some((r) => r.name === "Set the table")).toBe(true);
  });

  it("reports enabled/customized/off status per child", () => {
    const a = createChild({
      householdId,
      displayName: "Status Kid A",
      birthdate: "2015-01-01",
      status: "active",
    });
    const b = createChild({
      householdId,
      displayName: "Status Kid B",
      birthdate: "2013-01-01",
      status: "active",
    });

    const template = createResponsibilityTemplate(householdId, {
      name: "Fold laundry",
      weeklyValueCents: 350,
      cadence: "weekly",
    });

    disableTemplateForChild(b, template.id);
    instantiateTemplatesForChild(householdId, a); // idempotent-ish no-op check: a already has it

    const status = templateChildStatus(householdId, template.id);
    const aStatus = status.find((s) => s.childId === a)!;
    const bStatus = status.find((s) => s.childId === b)!;

    expect(aStatus.enabled).toBe(true);
    expect(aStatus.customized).toBe(false);
    expect(bStatus.enabled).toBe(false);
  });
});

const {
  createBillTemplate,
  updateBillTemplate,
  disableBillTemplateForChild,
  enableBillTemplateForChild,
  billTemplateChildStatus,
} = await import("@/lib/bills");

describe("family-level bill templates", () => {
  it("applies a new bill to every existing child", () => {
    const a = createChild({
      householdId,
      displayName: "Bill Kid A",
      birthdate: "2015-01-01",
      status: "active",
    });
    const b = createChild({
      householdId,
      displayName: "Bill Kid B",
      birthdate: "2013-01-01",
      status: "active",
    });

    const template = createBillTemplate(householdId, {
      name: "Rent",
      amountCents: 1500,
      cadence: "monthly",
      dueDay: 1,
      disposition: "held_for_child",
      sourceAccountOrder: ["checking"],
      mayUseEarmarked: false,
      autopay: true,
    });

    for (const id of [a, b]) {
      const row = listBills(id).find((r) => r.templateId === template.id);
      expect(row).toBeDefined();
      expect(row!.amountCents).toBe(1500);
      expect(row!.syncedWithTemplate).toBe(true);
    }
  });

  it("propagates a bill template edit only to children still in sync", () => {
    const a = createChild({
      householdId,
      displayName: "Bill Sync Kid",
      birthdate: "2015-01-01",
      status: "active",
    });
    const b = createChild({
      householdId,
      displayName: "Bill Diverged Kid",
      birthdate: "2013-01-01",
      status: "active",
    });

    const template = createBillTemplate(householdId, {
      name: "Phone plan",
      amountCents: 1000,
      cadence: "monthly",
      dueDay: 15,
      disposition: "disappears",
      sourceAccountOrder: ["checking"],
      mayUseEarmarked: false,
      autopay: true,
    });

    const bRow = listBills(b).find((r) => r.templateId === template.id)!;
    db.update(schema.bill)
      .set({ amountCents: 2000, syncedWithTemplate: false })
      .where(eq(schema.bill.id, bRow.id))
      .run();

    updateBillTemplate(template.id, {
      name: "Phone plan",
      amountCents: 1200,
      cadence: "monthly",
      dueDay: 15,
      disposition: "disappears",
      sourceAccountOrder: ["checking"],
      mayUseEarmarked: false,
      autopay: true,
    });

    const aRow = listBills(a).find((r) => r.templateId === template.id)!;
    const bRowAfter = listBills(b).find((r) => r.templateId === template.id)!;

    expect(aRow.amountCents).toBe(1200);
    expect(bRowAfter.amountCents).toBe(2000);
  });

  it("disables and re-enables a bill for one child without touching others", () => {
    const a = createChild({
      householdId,
      displayName: "Bill Toggle A",
      birthdate: "2015-01-01",
      status: "active",
    });
    const b = createChild({
      householdId,
      displayName: "Bill Toggle B",
      birthdate: "2013-01-01",
      status: "active",
    });

    const template = createBillTemplate(householdId, {
      name: "Streaming",
      amountCents: 500,
      cadence: "monthly",
      dueDay: 5,
      disposition: "family_fund",
      sourceAccountOrder: ["checking"],
      mayUseEarmarked: false,
      autopay: true,
    });

    disableBillTemplateForChild(b, template.id);
    expect(listBills(a).some((r) => r.templateId === template.id)).toBe(true);
    expect(listBills(b).some((r) => r.templateId === template.id)).toBe(false);

    enableBillTemplateForChild(householdId, b, template.id);
    const restored = listBills(b).find((r) => r.templateId === template.id);
    expect(restored).toBeDefined();
    expect(restored!.amountCents).toBe(500);

    const status = billTemplateChildStatus(householdId, template.id);
    expect(status.find((s) => s.childId === a)!.enabled).toBe(true);
    expect(status.find((s) => s.childId === b)!.enabled).toBe(true);
  });
});
