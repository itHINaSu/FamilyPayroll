/**
 * Ledger service tests.
 *
 * These run against a real SQLite file with the real migrations, so the
 * append-only triggers are live. The point is to prove that the balance a
 * parent reads can never disagree with the entries behind it (I6), and that
 * corrections leave the original record intact (I2).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;

// The module under test opens the database through @/db, which reads its path
// from config at import time — so the temp location has to be set before either
// module is loaded.
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-ledger-"));
  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

vi.mock("server-only", () => ({}));

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const schema = await import("@/db/schema");
const {
  LedgerError,
  getBalances,
  listLedger,
  reconcileAll,
  recordTransaction,
  recordTransfer,
  reverseEntry,
} = await import("@/lib/ledger");
const { createChild } = await import("@/lib/children");

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
    displayName: `Child ${crypto.randomUUID().slice(0, 6)}`,
    birthdate: "2019-04-01",
    status: "active",
  });
});

describe("createChild", () => {
  it("opens four accounts, with held invisible to the child", () => {
    const accounts = db
      .select()
      .from(schema.account)
      .where(eq(schema.account.childId, childId))
      .all();

    expect(accounts).toHaveLength(4);
    const held = accounts.find((a) => a.type === "held");
    expect(held?.visibleToChild).toBe(false);
    expect(
      accounts.filter((a) => a.visibleToChild).map((a) => a.type).sort(),
    ).toEqual(["checking", "generosity", "savings"]);
  });
});

describe("recordTransaction", () => {
  it("posts a deposit and moves the cached balance with it", () => {
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 2500,
      type: "cash_deposit",
      description: "Birthday money from Grandma",
    });

    expect(getBalances(childId).checking).toBe(2500);
    expect(reconcileAll()).toEqual([]);
  });

  it("refuses to overdraw an account", () => {
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 500,
      type: "cash_deposit",
      description: "seed",
    });

    expect(() =>
      recordTransaction({
        childId,
        accountType: "checking",
        amountCents: -900,
        type: "purchase",
        description: "too much",
      }),
    ).toThrow(LedgerError);

    // The failed attempt left nothing behind.
    expect(getBalances(childId).checking).toBe(500);
    expect(listLedger(childId)).toHaveLength(1);
  });

  it("lets an adjustment go negative, as the deliberate escape hatch", () => {
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: -250,
      type: "adjustment",
      description: "correcting an over-credit",
      allowNegative: true,
    });

    expect(getBalances(childId).checking).toBe(-250);
    expect(reconcileAll()).toEqual([]);
  });

  it("rejects zero and fractional amounts", () => {
    const base = {
      childId,
      accountType: "checking" as const,
      type: "cash_deposit" as const,
      description: "x",
    };
    expect(() => recordTransaction({ ...base, amountCents: 0 })).toThrow(
      /record nothing/,
    );
    expect(() => recordTransaction({ ...base, amountCents: 10.5 })).toThrow(
      /whole number of cents/,
    );
  });
});

describe("recordTransfer", () => {
  beforeEach(() => {
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 5000,
      type: "cash_deposit",
      description: "seed",
    });
  });

  it("moves money between accounts without changing the total", () => {
    recordTransfer({
      childId,
      fromAccount: "checking",
      toAccount: "savings",
      amountCents: 2000,
      description: "Saving for a Lego set",
    });

    const balances = getBalances(childId);
    expect(balances.checking).toBe(3000);
    expect(balances.savings).toBe(2000);
    expect(balances.visibleTotal).toBe(5000);
    expect(reconcileAll()).toEqual([]);
  });

  it("posts both legs under one transfer group", () => {
    recordTransfer({
      childId,
      fromAccount: "checking",
      toAccount: "generosity",
      amountCents: 1000,
      description: "for giving",
    });

    const legs = listLedger(childId).filter((r) => r.entry.transferGroupId);
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((l) => l.entry.transferGroupId)).size).toBe(1);
  });

  it("never half-happens when the source is short", () => {
    expect(() =>
      recordTransfer({
        childId,
        fromAccount: "savings",
        toAccount: "checking",
        amountCents: 9999,
        description: "more than exists",
      }),
    ).toThrow(LedgerError);

    const balances = getBalances(childId);
    expect(balances.checking).toBe(5000);
    expect(balances.savings).toBe(0);
    expect(reconcileAll()).toEqual([]);
  });

  it("rejects a transfer to the same account", () => {
    expect(() =>
      recordTransfer({
        childId,
        fromAccount: "checking",
        toAccount: "checking",
        amountCents: 100,
        description: "nowhere",
      }),
    ).toThrow(/two different accounts/);
  });
});

describe("reverseEntry — invariant I2", () => {
  it("undoes the balance while leaving the original entry in place", () => {
    const entryId = recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 1200,
      type: "cash_deposit",
      description: "Recorded twice by mistake",
    });

    reverseEntry(entryId, "user-1", "duplicate");

    expect(getBalances(childId).checking).toBe(0);

    const entries = listLedger(childId);
    expect(entries).toHaveLength(2);

    const original = entries.find((e) => e.entry.id === entryId);
    expect(original?.entry.amountCents).toBe(1200); // untouched

    const reversal = entries.find((e) => e.entry.type === "reversal");
    expect(reversal?.entry.amountCents).toBe(-1200);
    expect(reversal?.entry.reversesEntryId).toBe(entryId);
    expect(reversal?.entry.description).toContain("duplicate");
  });

  it("reverses both legs of a transfer together", () => {
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 3000,
      type: "cash_deposit",
      description: "seed",
    });
    recordTransfer({
      childId,
      fromAccount: "checking",
      toAccount: "savings",
      amountCents: 1000,
      description: "oops",
    });

    const leg = listLedger(childId).find((r) => r.entry.type === "transfer_out");
    reverseEntry(leg!.entry.id, "user-1");

    const balances = getBalances(childId);
    expect(balances.checking).toBe(3000);
    expect(balances.savings).toBe(0);
    expect(reconcileAll()).toEqual([]);
  });

  it("refuses to reverse the same entry twice", () => {
    const entryId = recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 800,
      type: "cash_deposit",
      description: "once",
    });

    reverseEntry(entryId, "user-1");
    expect(() => reverseEntry(entryId, "user-1")).toThrow(/already been reversed/);
  });

  it("refuses to reverse a reversal", () => {
    const entryId = recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 800,
      type: "cash_deposit",
      description: "once",
    });
    reverseEntry(entryId, "user-1");

    const reversal = listLedger(childId).find((e) => e.entry.type === "reversal");
    expect(() => reverseEntry(reversal!.entry.id, "user-1")).toThrow(
      /cannot itself be reversed/,
    );
  });
});

describe("savings sub-buckets", () => {
  it("reports all savings as general while no goals exist", () => {
    recordTransaction({
      childId,
      accountType: "savings",
      amountCents: 4000,
      type: "cash_deposit",
      description: "seed",
    });

    const balances = getBalances(childId);
    expect(balances.savings).toBe(4000);
    expect(balances.savingsGeneral).toBe(4000);
    expect(balances.savingsEarmarked).toBe(0);
  });
});

describe("invariant I4 — held is excluded from the child-visible total", () => {
  it("keeps held money out of visibleTotal", () => {
    recordTransaction({
      childId,
      accountType: "checking",
      amountCents: 1000,
      type: "cash_deposit",
      description: "seed",
    });
    recordTransaction({
      childId,
      accountType: "held",
      amountCents: 5000,
      type: "bill_payment",
      description: "rent held for the future",
    });

    const balances = getBalances(childId);
    expect(balances.held).toBe(5000);
    expect(balances.visibleTotal).toBe(1000);
  });
});
