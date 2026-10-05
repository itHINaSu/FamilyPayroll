/**
 * Pause/resume and full reset, against a real database.
 *
 * The point of pausing is that resuming doesn't catch up: no stale draft
 * posts, no bill that fell due mid-pause gets collected, no paused period is
 * drafted, and the paused days count as excused rather than missed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-pause-"));
  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
  process.env.TZ = "America/Chicago";
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { eq } = await import("drizzle-orm");
const { db, sqlite } = await import("@/db");
const schema = await import("@/db/schema");
const { createChild } = await import("@/lib/children");
const { addDays, todayInHousehold } = await import("@/lib/dates");
const { draftPaystub, postPaystub, runPayrollCycle } = await import("@/lib/payroll");
const { generateInstances } = await import("@/lib/bills");
const { seedHousehold } = await import("@/lib/seed");
const { pausePayroll, payrollPausedOn, resumePayroll } = await import("@/lib/payroll-pause");
const { resetAllData } = await import("@/lib/backup");
const { setSecret, getSecret } = await import("@/lib/secrets");

let householdId: string;
let parentId: string;
let childId: string;

beforeAll(() => {
  householdId = db
    .insert(schema.household)
    .values({ name: "Test", timezone: "America/Chicago", setupCompletedAt: Date.now() })
    .returning({ id: schema.household.id })
    .get().id;
  seedHousehold(householdId);
  parentId = db
    .insert(schema.user)
    .values({
      householdId,
      // Unique: the suites share one connection, so a fixed name can collide.
      email: `parent-${crypto.randomUUID().slice(0, 8)}`,
      displayName: "Mom",
      passwordHash: "x",
      role: "parent",
    })
    .returning({ id: schema.user.id })
    .get().id;
});

beforeEach(() => {
  // Each test starts running, not paused.
  db.update(schema.household)
    .set({ payrollPausedOn: null, payrollResumedOn: null })
    .where(eq(schema.household.id, householdId))
    .run();

  childId = createChild({
    householdId,
    displayName: `Kid ${crypto.randomUUID().slice(0, 6)}`,
    birthdate: "2016-04-01",
    status: "active",
  });
  db.insert(schema.responsibility)
    .values({
      childId,
      name: "Make your bed",
      weeklyValueCents: 700,
      cadence: "daily",
      effectiveFrom: "2020-01-01",
    })
    .run();
});

function stubsFor(id: string) {
  return db.select().from(schema.paystub).where(eq(schema.paystub.childId, id)).all();
}

describe("pausing", () => {
  it("discards unposted drafts but leaves posted stubs alone", () => {
    const posted = draftPaystub(householdId, childId, "2026-01-05", "2026-01-11", "2026-01-16");
    postPaystub(posted);
    draftPaystub(householdId, childId, "2026-01-12", "2026-01-18", "2026-01-23");

    const { discardedDrafts } = pausePayroll(householdId, parentId);

    const left = stubsFor(childId);
    expect(discardedDrafts).toBeGreaterThanOrEqual(1);
    expect(left).toHaveLength(1);
    expect(left[0].status).toBe("posted");
    expect(left[0].id).toBe(posted);
  });

  it("clears untouched bill instances so nothing is back-billed on resume", () => {
    db.insert(schema.bill)
      .values({
        childId,
        name: "Rent",
        amountCents: 500,
        cadence: "weekly",
        dueDay: 5,
        disposition: "held_for_child",
        sourceAccountOrder: ["checking"],
        effectiveFrom: "2020-01-01",
      })
      .run();
    generateInstances(30);

    const before = db
      .select()
      .from(schema.billInstance)
      .where(eq(schema.billInstance.childId, childId))
      .all();
    expect(before.length).toBeGreaterThan(0);

    const { clearedBills } = pausePayroll(householdId, parentId);

    expect(clearedBills).toBeGreaterThanOrEqual(before.length);
    expect(
      db.select().from(schema.billInstance).where(eq(schema.billInstance.childId, childId)).all(),
    ).toHaveLength(0);
  });

  it("records the pause date", () => {
    pausePayroll(householdId, parentId);
    expect(payrollPausedOn(householdId)).toBe(todayInHousehold());
  });
});

describe("resuming", () => {
  it("excuses every paused day so none count as missed", () => {
    const today = todayInHousehold();
    const pausedOn = addDays(today, -10);
    db.update(schema.household)
      .set({ payrollPausedOn: pausedOn })
      .where(eq(schema.household.id, householdId))
      .run();

    const { excusedDays } = resumePayroll(householdId, parentId);

    expect(excusedDays).toBe(10);
    const ex = db
      .select()
      .from(schema.excusal)
      .where(eq(schema.excusal.childId, childId))
      .all();
    expect(ex).toHaveLength(1);
    expect(ex[0].startDate).toBe(pausedOn);
    expect(ex[0].endDate).toBe(addDays(today, -1));

    const home = db
      .select()
      .from(schema.household)
      .where(eq(schema.household.id, householdId))
      .get()!;
    expect(home.payrollPausedOn).toBeNull();
    expect(home.payrollResumedOn).toBe(today);
  });

  it("excuses nothing when paused and resumed the same day", () => {
    db.update(schema.household)
      .set({ payrollPausedOn: todayInHousehold() })
      .where(eq(schema.household.id, householdId))
      .run();

    expect(resumePayroll(householdId, parentId).excusedDays).toBe(0);
    expect(
      db.select().from(schema.excusal).where(eq(schema.excusal.childId, childId)).all(),
    ).toHaveLength(0);
  });

  it("never drafts a period that ended before payroll resumed", () => {
    // Resumed today: yesterday's period ended entirely inside the pause.
    db.update(schema.household)
      .set({ payrollResumedOn: todayInHousehold() })
      .where(eq(schema.household.id, householdId))
      .run();

    runPayrollCycle();

    expect(stubsFor(childId)).toHaveLength(0);
  });
});

describe("reset", () => {
  it("empties every table but keeps the schema and app secrets", () => {
    setSecret("session_secret", "keep-me");

    const { safetyBackup } = resetAllData();

    expect(fs.existsSync(safetyBackup)).toBe(true);
    for (const table of ["household", "user", "child", "paystub", "ledger_entry", "account"]) {
      const { n } = sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number };
      expect(n, table).toBe(0);
    }
    expect(getSecret("session_secret")).toBe("keep-me");

    // The immutability triggers came back with the schema.
    const { t } = sqlite
      .prepare(`SELECT count(*) AS t FROM sqlite_master WHERE type = 'trigger'`)
      .get() as { t: number };
    expect(t).toBe(4);

    // Schema still usable: the setup wizard's first insert works.
    const fresh = db
      .insert(schema.household)
      .values({ name: "Fresh" })
      .returning({ id: schema.household.id })
      .get();
    expect(fresh.id).toBeTruthy();
  });
});
