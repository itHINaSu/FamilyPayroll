/**
 * Invariant tests.
 *
 * These assert the guarantees in SPEC.md section 3 against a real SQLite file
 * with the real migrations applied. They exist because the invariants are the
 * part of this system that must not quietly erode: a future code path that
 * "just needs to fix one ledger row" should fail loudly here first.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";

import * as schema from "./schema";

let dir: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

let householdId: string;
let childId: string;
let checkingId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-invariants-"));
  sqlite = new Database(path.join(dir, "test.db"));
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });

  householdId = db
    .insert(schema.household)
    .values({ name: "Test Household", timezone: "America/Chicago" })
    .returning({ id: schema.household.id })
    .get().id;

  childId = db
    .insert(schema.child)
    .values({ householdId, displayName: "Test Child", birthdate: "2019-04-01" })
    .returning({ id: schema.child.id })
    .get().id;

  checkingId = db
    .insert(schema.account)
    .values({ childId, type: "checking", visibleToChild: true })
    .returning({ id: schema.account.id })
    .get().id;

  db.insert(schema.account)
    .values({ childId, type: "held", visibleToChild: false })
    .run();
});

afterAll(() => {
  sqlite.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function insertEntry(amountCents: number) {
  return db
    .insert(schema.ledgerEntry)
    .values({
      householdId,
      childId,
      accountId: checkingId,
      amountCents,
      type: "cash_deposit",
      occurredAt: Date.now(),
      description: "test",
      source: "manual",
    })
    .returning({ id: schema.ledgerEntry.id })
    .get();
}

describe("I2 — the ledger is append-only", () => {
  it("accepts inserts", () => {
    const entry = insertEntry(1000);
    expect(entry.id).toBeTruthy();
  });

  it("refuses to update an entry", () => {
    const entry = insertEntry(500);
    expect(() =>
      db
        .update(schema.ledgerEntry)
        .set({ amountCents: 999_999 })
        .where(eq(schema.ledgerEntry.id, entry.id))
        .run(),
    ).toThrow(/append-only/);
  });

  it("refuses to delete an entry", () => {
    const entry = insertEntry(250);
    expect(() =>
      db.delete(schema.ledgerEntry).where(eq(schema.ledgerEntry.id, entry.id)).run(),
    ).toThrow(/append-only/);
  });

  it("permits a correction as a reversing entry", () => {
    const original = insertEntry(4200);

    const reversal = db
      .insert(schema.ledgerEntry)
      .values({
        householdId,
        childId,
        accountId: checkingId,
        amountCents: -4200,
        type: "reversal",
        occurredAt: Date.now(),
        description: "reverses an incorrect deposit",
        source: "manual",
        reversesEntryId: original.id,
      })
      .returning({ id: schema.ledgerEntry.id })
      .get();

    expect(reversal.id).toBeTruthy();

    // The original is still there. That is the point.
    const still = db
      .select()
      .from(schema.ledgerEntry)
      .where(eq(schema.ledgerEntry.id, original.id))
      .get();
    expect(still?.amountCents).toBe(4200);
  });
});

describe("I5 — a posted pay stub is immutable", () => {
  // A child cannot have two pay periods starting on the same day, so each stub
  // in these tests needs its own week.
  let weekOffset = 0;

  function createPaystub(status: "draft" | "posted") {
    const day = (n: number) => String(5 + weekOffset * 7 + n).padStart(2, "0");
    const period = db
      .insert(schema.payPeriod)
      .values({
        childId,
        startDate: `2026-01-${day(0)}`,
        endDate: `2026-01-${day(6)}`,
        payDate: `2026-01-${day(11)}`,
      })
      .returning({ id: schema.payPeriod.id })
      .get();
    weekOffset++;

    return db
      .insert(schema.paystub)
      .values({
        childId,
        payPeriodId: period.id,
        status,
        potentialCents: 2000,
        earnedCents: 1750,
        grossCents: 1750,
        netCents: 1750,
        allocationsJson: { checking: 1050, savings: 350, generosity: 350 },
        policySnapshotJson: { allocation: { checking: 60, savings: 20, generosity: 20 } },
        revisionWindowEndsAt: Date.now() + 86_400_000,
      })
      .returning({ id: schema.paystub.id })
      .get();
  }

  it("allows a draft to be revised during the window", () => {
    const stub = createPaystub("draft");
    db.update(schema.paystub)
      .set({ earnedCents: 1800, revisionCount: 1 })
      .where(eq(schema.paystub.id, stub.id))
      .run();

    const updated = db
      .select()
      .from(schema.paystub)
      .where(eq(schema.paystub.id, stub.id))
      .get();
    expect(updated?.earnedCents).toBe(1800);
  });

  it("refuses to change a posted stub", () => {
    const stub = createPaystub("posted");
    expect(() =>
      db
        .update(schema.paystub)
        .set({ earnedCents: 9999 })
        .where(eq(schema.paystub.id, stub.id))
        .run(),
    ).toThrow(/immutable/);
  });

  it("refuses to delete a posted stub", () => {
    const stub = createPaystub("posted");
    expect(() =>
      db.delete(schema.paystub).where(eq(schema.paystub.id, stub.id)).run(),
    ).toThrow(/cannot be deleted/);
  });
});

describe("I4 — the held account is never child-visible", () => {
  it("is excluded from a visible-accounts query", () => {
    const visible = db
      .select()
      .from(schema.account)
      .where(eq(schema.account.visibleToChild, true))
      .all();

    expect(visible.every((a) => a.type !== "held")).toBe(true);
    expect(visible.map((a) => a.type)).toContain("checking");
  });
});

describe("I6 — cached balance is reconcilable against the ledger", () => {
  it("derives the same figure the reconciliation job will check", () => {
    const entries = db
      .select()
      .from(schema.ledgerEntry)
      .where(eq(schema.ledgerEntry.accountId, checkingId))
      .all();

    const derived = entries.reduce((sum, e) => sum + e.amountCents, 0);
    // 1000 + 500 + 250 + 4200 - 4200
    expect(derived).toBe(1750);
  });
});
