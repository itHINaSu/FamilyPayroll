/**
 * A simulated month.
 *
 * The unit tests cover each engine on its own. This one runs a child through
 * four weeks of real use — responsibilities, payroll, rent, a shortfall, a bonus
 * job, a savings goal, interest, and a trust incident — to prove the pieces
 * compose and that the invariants survive contact with each other.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-lifecycle-"));
  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
  process.env.TZ = "America/Chicago";
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const schema = await import("@/db/schema");
const { createChild } = await import("@/lib/children");
const { getBalances, reconcileAll, listLedger, recordTransaction } = await import(
  "@/lib/ledger",
);
const { draftPaystub, postPaystub } = await import("@/lib/payroll");
const { collectBill, generateInstances } = await import("@/lib/bills");
const { accrueDaily, postMonthlyInterest } = await import("@/lib/interest");
const { earmark, listGoals } = await import("@/lib/goals");
const { claimJob, decideJobClaim, submitJobClaim } = await import("@/lib/jobs");
const trust = await import("@/lib/trust");
const { seedHousehold } = await import("@/lib/seed");

describe("a month in the life", () => {
  it("runs four weeks end to end with every invariant intact", () => {
    const householdId = db
      .insert(schema.household)
      .values({ name: "The Test Family", timezone: "America/Chicago" })
      .returning({ id: schema.household.id })
      .get().id;

    seedHousehold(householdId);

    const childId = createChild({
      householdId,
      displayName: "Ava",
      birthdate: "2019-06-15",
      status: "active",
    });

    // --- Setup: two responsibilities and rent ------------------------------

    const bed = db
      .insert(schema.responsibility)
      .values({
        childId,
        name: "Make your bed",
        weeklyValueCents: 350,
        cadence: "daily",
        effectiveFrom: "2026-01-01",
        payMode: "optional",
      })
      .returning({ id: schema.responsibility.id })
      .get().id;

    const room = db
      .insert(schema.responsibility)
      .values({
        childId,
        name: "Tidy your room",
        weeklyValueCents: 200,
        cadence: "weekly",
        effectiveFrom: "2026-01-01",
        payMode: "optional",
      })
      .returning({ id: schema.responsibility.id })
      .get().id;

    db.insert(schema.bill)
      .values({
        childId,
        name: "Rent",
        amountCents: 500,
        cadence: "monthly",
        dueDay: 28,
        disposition: "held_for_child",
        sourceAccountOrder: ["checking"],
        effectiveFrom: "2026-01-01",
      })
      .run();

    const weeks = [
      { start: "2026-03-02", end: "2026-03-08", pay: "2026-03-13" },
      { start: "2026-03-09", end: "2026-03-15", pay: "2026-03-20" },
      { start: "2026-03-16", end: "2026-03-22", pay: "2026-03-27" },
      { start: "2026-03-23", end: "2026-03-29", pay: "2026-04-03" },
    ];

    const dates = (start: string, count: number) =>
      Array.from({ length: count }, (_, i) => {
        const d = new Date(`${start}T12:00:00`);
        d.setDate(d.getDate() + i);
        return d.toLocaleDateString("en-CA");
      });

    // Week 1: perfect. Weeks 2-4: five of seven days.
    const perWeek = [7, 5, 5, 5];

    weeks.forEach((week, index) => {
      for (const date of dates(week.start, perWeek[index])) {
        db.insert(schema.completion)
          .values({ responsibilityId: bed, childId, occurrenceDate: date, status: "claimed" })
          .run();
      }
      db.insert(schema.completion)
        .values({
          responsibilityId: room,
          childId,
          occurrenceDate: week.start,
          status: "claimed",
        })
        .run();
    });

    // --- Week 1: a bonus job on top of a perfect week ----------------------

    const jobId = db
      .insert(schema.job)
      .values({
        householdId,
        name: "Wash the car",
        valueCents: 500,
        repeatRule: "weekly",
        limitScope: "per_child",
        limitCount: 1,
      })
      .returning({ id: schema.job.id })
      .get().id;

    const claimId = claimJob(jobId, childId);
    submitJobClaim(claimId);
    decideJobClaim(claimId, true, "parent-1");

    const stub1 = draftPaystub(householdId, childId, weeks[0].start, weeks[0].end, weeks[0].pay);

    // Nothing reaches the ledger until it posts.
    expect(getBalances(childId).visibleTotal).toBe(0);

    postPaystub(stub1);

    // $3.50 bed + $2.00 room + $5.00 job = $10.50
    expect(getBalances(childId).visibleTotal).toBe(1050);

    // --- Weeks 2 and 3 -----------------------------------------------------

    for (const week of weeks.slice(1, 3)) {
      postPaystub(draftPaystub(householdId, childId, week.start, week.end, week.pay));
    }

    // Two more weeks at $2.50 bed + $2.00 room = $4.50 each.
    expect(getBalances(childId).visibleTotal).toBe(1050 + 900);

    // --- A savings goal ----------------------------------------------------

    const balancesBeforeGoal = getBalances(childId);
    const goalId = db
      .insert(schema.goal)
      .values({ childId, name: "Lego set", targetCents: 4999 })
      .returning({ id: schema.goal.id })
      .get().id;

    earmark(childId, goalId, balancesBeforeGoal.savingsGeneral);

    const afterEarmark = getBalances(childId);
    expect(afterEarmark.savings).toBe(balancesBeforeGoal.savings); // money did not move
    expect(afterEarmark.savingsGeneral).toBe(0);
    expect(listGoals(childId)[0].savedCents).toBe(balancesBeforeGoal.savings);

    // --- A trust incident, which must not touch money ----------------------

    const area = db
      .select()
      .from(schema.trustArea)
      .where(eq(schema.trustArea.householdId, householdId))
      .get()!;

    const moneyBefore = getBalances(childId);
    trust.recordMark({
      childId,
      trustAreaId: area.id,
      weight: 2,
      note: "yelled at their brother",
      createdByUserId: "parent-1",
    });

    expect(getBalances(childId)).toEqual(moneyBefore); // invariant I10
    expect(trust.trustLevelFor(childId, area.id).level.name).toBe("Working on it");

    // --- Rent comes due, and there is not enough in checking ---------------

    // Spend most of checking first, so the shortfall is the interesting case.
    const checking = getBalances(childId).checking;
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: -(checking - 200),
      type: "purchase",
      description: "Pokemon cards",
    });

    generateInstances(60, "2026-03-01");
    const rent = db
      .select()
      .from(schema.billInstance)
      .where(eq(schema.billInstance.childId, childId))
      .get()!;

    const collection = collectBill(rent.id);

    expect(collection.collected).toBe(200); // took what there was
    expect(collection.shortfall).toBe(300); // and carried the rest
    expect(getBalances(childId).held).toBe(200); // secretly saved
    expect(getBalances(childId).checking).toBe(0);

    // The Lego fund was NOT raided to pay rent.
    expect(getBalances(childId).savingsEarmarked).toBe(balancesBeforeGoal.savings);

    // --- Week 4: past due comes off the top of the next paycheck -----------

    const stub4 = draftPaystub(householdId, childId, weeks[3].start, weeks[3].end, weeks[3].pay);
    const stub4Row = db
      .select()
      .from(schema.paystub)
      .where(eq(schema.paystub.id, stub4))
      .get()!;

    expect(stub4Row.pastDueRecoveredCents).toBe(300);
    expect(stub4Row.netCents).toBe(stub4Row.grossCents - 300);

    postPaystub(stub4);

    // Rent is now fully settled and the held fund has the whole $5.00.
    const settledRent = db
      .select()
      .from(schema.billInstance)
      .where(eq(schema.billInstance.id, rent.id))
      .get()!;
    expect(settledRent.status).toBe("paid");
    expect(getBalances(childId).held).toBe(500);

    // --- A month of interest ----------------------------------------------

    for (let day = 1; day <= 30; day++) {
      accrueDaily(`2026-04-${String(day).padStart(2, "0")}`);
    }
    const beforeInterest = getBalances(childId).savings;
    postMonthlyInterest("2026-05-01");
    expect(getBalances(childId).savings).toBeGreaterThan(beforeInterest);

    // --- Invariants still hold across all of it ----------------------------

    // I6: every cached balance matches its ledger.
    expect(reconcileAll()).toEqual([]);

    // I3: every posted stub allocated exactly.
    const stubs = db
      .select()
      .from(schema.paystub)
      .where(eq(schema.paystub.childId, childId))
      .all();

    expect(stubs).toHaveLength(4);
    for (const stub of stubs) {
      const allocations = stub.allocationsJson as Record<string, number>;
      const sum = Object.values(allocations).reduce((a, b) => a + b, 0);
      expect(sum).toBe(stub.netCents);
      expect(stub.status).toBe("posted");
      // I5: each carries the policy that produced it.
      expect(stub.policySnapshotJson).toBeTruthy();
    }

    // I2: the ledger only ever grew.
    const entries = listLedger(childId, 500);
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.every((e) => Number.isInteger(e.entry.amountCents))).toBe(true);

    // I4: held money never counted toward what the child sees.
    const final = getBalances(childId);
    expect(final.held).toBe(500);
    expect(final.visibleTotal).toBe(
      final.checking + final.savings + final.generosity,
    );
  });
});
