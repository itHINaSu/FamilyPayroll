import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  account,
  child,
  ledgerEntry,
  type AccountType,
  type LedgerEntryType,
  type LedgerSource,
} from "@/db/schema";

/**
 * The ledger service.
 *
 * Every movement of money in the system passes through here. Two rules are
 * absolute and are the reason this is a single choke point rather than scattered
 * inserts:
 *
 *  - Nothing is ever updated or deleted (invariant I2). SQLite triggers enforce
 *    it, so a caller that tries will get an exception rather than silent
 *    corruption. Corrections go through `reverseEntry`.
 *  - A ledger insert and its account balance update happen in one transaction,
 *    so the cached balance can never drift from the entries that produced it
 *    (invariant I6). `reconcileAll` re-derives and alerts if it ever does.
 */

export type PostInput = {
  childId: string;
  accountType: AccountType;
  amountCents: number;
  type: LedgerEntryType;
  description: string;
  memo?: string | null;
  occurredAt?: number;
  actorUserId?: string | null;
  source?: LedgerSource;
  goalId?: string | null;
  paystubId?: string | null;
  billInstanceId?: string | null;
  jobClaimId?: string | null;
  transferGroupId?: string | null;
  /** Adjustments are the escape hatch and may drive a balance negative. */
  allowNegative?: boolean;
};

export class LedgerError extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function resolveAccount(tx: Tx, childId: string, type: AccountType) {
  const row = tx
    .select()
    .from(account)
    .where(and(eq(account.childId, childId), eq(account.type, type)))
    .get();

  if (!row) {
    throw new LedgerError(`No ${type} account exists for this child.`);
  }
  return row;
}

function postWithin(tx: Tx, input: PostInput): string {
  if (!Number.isInteger(input.amountCents)) {
    throw new LedgerError("Amount must be a whole number of cents.");
  }
  if (input.amountCents === 0) {
    throw new LedgerError("A zero-value entry would record nothing.");
  }

  const acct = resolveAccount(tx, input.childId, input.accountType);
  const resulting = acct.balanceCents + input.amountCents;

  if (resulting < 0 && !input.allowNegative) {
    throw new LedgerError(
      `That would leave ${input.accountType} at ${resulting / 100}. ` +
        `There is not enough in the account.`,
    );
  }

  const householdId = tx
    .select({ householdId: child.householdId })
    .from(child)
    .where(eq(child.id, input.childId))
    .get()?.householdId;

  if (!householdId) throw new LedgerError("That child could not be found.");

  const entry = tx
    .insert(ledgerEntry)
    .values({
      householdId,
      childId: input.childId,
      accountId: acct.id,
      goalId: input.goalId ?? null,
      amountCents: input.amountCents,
      type: input.type,
      occurredAt: input.occurredAt ?? Date.now(),
      description: input.description,
      memo: input.memo ?? null,
      actorUserId: input.actorUserId ?? null,
      source: input.source ?? "manual",
      paystubId: input.paystubId ?? null,
      billInstanceId: input.billInstanceId ?? null,
      jobClaimId: input.jobClaimId ?? null,
      transferGroupId: input.transferGroupId ?? null,
    })
    .returning({ id: ledgerEntry.id })
    .get();

  tx.update(account)
    .set({ balanceCents: resulting })
    .where(eq(account.id, acct.id))
    .run();

  return entry.id;
}

/** Post a single entry. Use `recordTransfer` for anything with two sides. */
export function recordTransaction(input: PostInput): string {
  return db.transaction((tx) => postWithin(tx, input));
}

export type TransferInput = {
  childId: string;
  fromAccount: AccountType;
  toAccount: AccountType;
  amountCents: number;
  description: string;
  memo?: string | null;
  actorUserId?: string | null;
  occurredAt?: number;
  source?: LedgerSource;
};

/**
 * Two entries sharing a `transferGroupId` — double-entry-lite. Both sides post
 * inside one transaction, so a transfer can never half-happen.
 */
export function recordTransfer(input: TransferInput): string {
  if (input.fromAccount === input.toAccount) {
    throw new LedgerError("Pick two different accounts.");
  }
  if (input.amountCents <= 0) {
    throw new LedgerError("Transfer amount must be positive.");
  }

  const groupId = crypto.randomUUID();
  const occurredAt = input.occurredAt ?? Date.now();

  db.transaction((tx) => {
    postWithin(tx, {
      childId: input.childId,
      accountType: input.fromAccount,
      amountCents: -input.amountCents,
      type: "transfer_out",
      description: input.description,
      memo: input.memo,
      occurredAt,
      actorUserId: input.actorUserId,
      source: input.source,
      transferGroupId: groupId,
    });

    postWithin(tx, {
      childId: input.childId,
      accountType: input.toAccount,
      amountCents: input.amountCents,
      type: "transfer_in",
      description: input.description,
      memo: input.memo,
      occurredAt,
      actorUserId: input.actorUserId,
      source: input.source,
      transferGroupId: groupId,
    });
  });

  return groupId;
}

/**
 * Correct a mistake by posting its opposite. The original entry is never
 * touched, which is the entire point — in ten years a child should be able to
 * see both that something was recorded and that it was put right.
 *
 * Reversing one leg of a transfer reverses both; a half-undone transfer would
 * leave money that exists in neither account.
 */
export function reverseEntry(
  entryId: string,
  actorUserId: string,
  reason?: string,
): void {
  db.transaction((tx) => {
    const original = tx
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.id, entryId))
      .get();

    if (!original) throw new LedgerError("That entry could not be found.");
    if (original.type === "reversal") {
      throw new LedgerError("A reversal cannot itself be reversed.");
    }

    const alreadyReversed = tx
      .select({ id: ledgerEntry.id })
      .from(ledgerEntry)
      .where(eq(ledgerEntry.reversesEntryId, entryId))
      .get();

    if (alreadyReversed) {
      throw new LedgerError("That entry has already been reversed.");
    }

    const legs = original.transferGroupId
      ? tx
          .select()
          .from(ledgerEntry)
          .where(eq(ledgerEntry.transferGroupId, original.transferGroupId))
          .all()
      : [original];

    for (const leg of legs) {
      const acct = tx
        .select()
        .from(account)
        .where(eq(account.id, leg.accountId))
        .get();
      if (!acct) throw new LedgerError("The account for that entry is missing.");

      tx.insert(ledgerEntry)
        .values({
          householdId: leg.householdId,
          childId: leg.childId,
          accountId: leg.accountId,
          goalId: leg.goalId,
          amountCents: -leg.amountCents,
          type: "reversal",
          occurredAt: Date.now(),
          description: reason?.trim()
            ? `Reversed: ${leg.description} — ${reason.trim()}`
            : `Reversed: ${leg.description}`,
          actorUserId,
          source: "manual",
          reversesEntryId: leg.id,
          transferGroupId: leg.transferGroupId,
        })
        .run();

      tx.update(account)
        .set({ balanceCents: acct.balanceCents - leg.amountCents })
        .where(eq(account.id, acct.id))
        .run();
    }
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type Balances = {
  checking: number;
  savings: number;
  generosity: number;
  held: number;
  /** Savings not earmarked to any goal. Goals arrive in phase 6. */
  savingsGeneral: number;
  savingsEarmarked: number;
  /** Child-visible total. Deliberately excludes `held` (invariant I4). */
  visibleTotal: number;
};

export function getBalances(childId: string): Balances {
  const accounts = db
    .select()
    .from(account)
    .where(eq(account.childId, childId))
    .all();

  const byType = (t: AccountType) =>
    accounts.find((a) => a.type === t)?.balanceCents ?? 0;

  const savingsAccount = accounts.find((a) => a.type === "savings");

  const savingsGeneral = savingsAccount
    ? (db
        .select({ total: sql<number>`coalesce(sum(${ledgerEntry.amountCents}), 0)` })
        .from(ledgerEntry)
        .where(
          and(
            eq(ledgerEntry.accountId, savingsAccount.id),
            isNull(ledgerEntry.goalId),
          ),
        )
        .get()?.total ?? 0)
    : 0;

  const savings = byType("savings");

  return {
    checking: byType("checking"),
    savings,
    generosity: byType("generosity"),
    held: byType("held"),
    savingsGeneral,
    savingsEarmarked: savings - savingsGeneral,
    visibleTotal: byType("checking") + savings + byType("generosity"),
  };
}

export function listLedger(childId: string, limit = 100, offset = 0) {
  return db
    .select({
      entry: ledgerEntry,
      accountType: account.type,
    })
    .from(ledgerEntry)
    .innerJoin(account, eq(ledgerEntry.accountId, account.id))
    .where(eq(ledgerEntry.childId, childId))
    .orderBy(desc(ledgerEntry.occurredAt), desc(ledgerEntry.postedAt))
    .limit(limit)
    .offset(offset)
    .all();
}

/**
 * Cross-child recent activity with actor attribution.
 *
 * This is the defence against the two-parent double-entry problem: one of you
 * deducts $4 at the checkout and the other, not knowing, deducts it again.
 * Seeing "Dad · 6 minutes ago" on the way in prevents it.
 */
export function listRecentActivity(householdId: string, limit = 15) {
  return db
    .select({
      entry: ledgerEntry,
      accountType: account.type,
      childName: child.displayName,
    })
    .from(ledgerEntry)
    .innerJoin(account, eq(ledgerEntry.accountId, account.id))
    .innerJoin(child, eq(ledgerEntry.childId, child.id))
    .where(eq(ledgerEntry.householdId, householdId))
    .orderBy(desc(ledgerEntry.postedAt))
    .limit(limit)
    .all();
}

/**
 * Invariant I6. Returns accounts whose cached balance has drifted from the sum
 * of their entries. An empty array is the healthy state; anything else means a
 * write path bypassed this module and needs finding.
 */
export function reconcileAll(): {
  accountId: string;
  cached: number;
  derived: number;
}[] {
  const cached = db
    .select({ id: account.id, balanceCents: account.balanceCents })
    .from(account)
    .all();

  const sums = db
    .select({
      accountId: ledgerEntry.accountId,
      total: sql<number>`sum(${ledgerEntry.amountCents})`,
    })
    .from(ledgerEntry)
    .groupBy(ledgerEntry.accountId)
    .all();

  const derivedByAccount = new Map(sums.map((s) => [s.accountId, s.total]));

  return cached
    .map((a) => ({
      accountId: a.id,
      cached: a.balanceCents,
      derived: derivedByAccount.get(a.id) ?? 0,
    }))
    .filter((r) => r.cached !== r.derived);
}

export const LEDGER_TYPE_LABELS: Record<LedgerEntryType, string> = {
  opening_balance: "Opening balance",
  payroll_deposit: "Payroll",
  bonus_deposit: "Bonus pay",
  cash_deposit: "Cash in",
  cash_withdrawal: "Cash out",
  purchase: "Purchase",
  bill_charge: "Bill due",
  bill_payment: "Bill paid",
  past_due_recovery: "Past due recovered",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  earmark_in: "Earmarked",
  earmark_out: "Un-earmarked",
  interest: "Interest",
  donation: "Donation",
  adjustment: "Adjustment",
  reversal: "Reversal",
};
