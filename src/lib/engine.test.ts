/**
 * Payroll, bills, interest, and trust, against a real database.
 *
 * These assert the behaviours the design conversation actually turned on: that
 * doing nothing still pays a child, that excusals lower potential rather than
 * earnings, that a bad afternoon never touches money, and that trust recovers
 * on its own.
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
const { collectBill, generateInstances, upcomingBills } = await import("@/lib/bills");
const { accrueDaily, postMonthlyInterest, lifetimeInterestCents } = await import(
  "@/lib/interest"
);
const { earmark, listGoals, unearmark } = await import("@/lib/goals");
const trust = await import("@/lib/trust");
const { seedHousehold } = await import("@/lib/seed");
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
  seedHousehold(householdId);
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

  it("counts an excusal against potential, not against earnings — invariant I8", () => {
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

    // Two days excused: five chances, five done. Potential drops; earnings do not.
    expect(draft.potentialCents).toBe(250);
    expect(draft.earnedCents).toBe(250);
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

describe("trust — invariant I10", () => {
  function firstArea() {
    return db
      .select()
      .from(schema.trustArea)
      .where(eq(schema.trustArea.householdId, householdId))
      .get()!;
  }

  it("never touches money", () => {
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 2500,
      type: "cash_deposit",
      description: "seed",
    });

    const before = getBalances(childId);
    const area = firstArea();

    trust.recordMark({
      childId,
      trustAreaId: area.id,
      weight: 2,
      note: "hit sibling",
      createdByUserId: "parent-1",
    });

    expect(getBalances(childId)).toEqual(before);

    const entries = db
      .select()
      .from(schema.ledgerEntry)
      .where(eq(schema.ledgerEntry.childId, childId))
      .all();
    expect(entries).toHaveLength(1); // only the seed deposit
  });

  it("drops a level as marks accumulate", () => {
    const area = firstArea();

    expect(trust.trustLevelFor(childId, area.id).level.name).toBe("Trusted");

    trust.recordMark({
      childId,
      trustAreaId: area.id,
      weight: 1,
      createdByUserId: "p",
    });
    expect(trust.trustLevelFor(childId, area.id).level.name).toBe("Working on it");

    trust.recordMark({
      childId,
      trustAreaId: area.id,
      weight: 2,
      createdByUserId: "p",
    });
    expect(trust.trustLevelFor(childId, area.id).level.name).toBe("Not ready today");
  });

  it("caps the load, so one bad afternoon cannot dig an endless hole", () => {
    const area = firstArea();

    for (let i = 0; i < 10; i++) {
      trust.recordMark({
        childId,
        trustAreaId: area.id,
        weight: 2,
        createdByUserId: "p",
      });
    }

    expect(trust.trustLevelFor(childId, area.id).load).toBe(6); // default cap
  });

  it("floors credits at zero, so goodwill cannot be banked", () => {
    const area = firstArea();

    trust.recordMark({ childId, trustAreaId: area.id, weight: 1, createdByUserId: "p" });
    trust.recordMark({ childId, trustAreaId: area.id, weight: -5, createdByUserId: "p" });

    expect(trust.trustLevelFor(childId, area.id).load).toBe(0);

    // A later infraction still costs full price — nothing was banked against it.
    trust.recordMark({ childId, trustAreaId: area.id, weight: 2, createdByUserId: "p" });
    expect(trust.trustLevelFor(childId, area.id).load).toBe(2);
  });

  it("drains with time, so doing nothing heals", () => {
    const area = firstArea();

    trust.recordMark({ childId, trustAreaId: area.id, weight: 4, createdByUserId: "p" });
    expect(trust.trustLevelFor(childId, area.id).load).toBe(4);

    // Rewind the drain clock by 24 hours: two intervals at 2 points each.
    db.update(schema.trustState)
      .set({ lastDrainedAt: Date.now() - 24 * 3_600_000 })
      .where(
        and(
          eq(schema.trustState.childId, childId),
          eq(schema.trustState.trustAreaId, area.id),
        ),
      )
      .run();

    expect(trust.trustLevelFor(childId, area.id).load).toBe(0);
    expect(trust.trustLevelFor(childId, area.id).level.name).toBe("Trusted");
  });

  it("retracts a mark cleanly, unlike the ledger", () => {
    const area = firstArea();

    const markId = trust.recordMark({
      childId,
      trustAreaId: area.id,
      weight: 2,
      createdByUserId: "p",
    });
    expect(trust.trustLevelFor(childId, area.id).load).toBe(2);

    trust.retractMark(markId);
    expect(trust.trustLevelFor(childId, area.id).load).toBe(0);
  });

  it("keeps areas independent", () => {
    const areas = db
      .select()
      .from(schema.trustArea)
      .where(eq(schema.trustArea.householdId, householdId))
      .all();

    const friendships = areas.find((a) => a.name === "Friendships")!;
    const screens = areas.find((a) => a.name === "Screens")!;

    trust.recordMark({
      childId,
      trustAreaId: friendships.id,
      weight: 4,
      createdByUserId: "p",
    });

    // Unkind to a friend does not cost television.
    expect(trust.trustLevelFor(childId, friendships.id).level.level).toBeLessThan(3);
    expect(trust.trustLevelFor(childId, screens.id).level.name).toBe("Trusted");
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

  it("warns when trust recovery is too far removed for a young child", () => {
    const slow = {
      ...DEFAULT_POLICY,
      trust: { ...DEFAULT_POLICY.trust, drainAmount: 1, drainIntervalHours: 24, capLoad: 10 },
    };
    expect(checkGuardrails(slow, 6).some((w) => w.field === "trust")).toBe(true);
    expect(checkGuardrails(slow, 15).some((w) => w.field === "trust")).toBe(false);
  });
});
