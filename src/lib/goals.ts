import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { goal, ledgerEntry, account, child } from "@/db/schema";
import { LedgerError, getBalances } from "@/lib/ledger";

/**
 * Savings goals (SPEC §4.3).
 *
 * Goals are sub-buckets **inside** savings, not separate accounts. Earmarking
 * moves money from general savings into a goal; both figures stay visible, so a
 * child always sees the real savings balance as well as what is spoken for.
 *
 * Earmarking teaches prioritisation, which display-only progress bars cannot:
 * three goals all showing 100% against one shared balance is a fiction.
 */

export type GoalWithProgress = {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  photoBlobId: string | null;
  status: "active" | "achieved" | "cancelled";
  progressPct: number;
  remainingCents: number;
};

function householdIdFor(childId: string): string {
  const row = db
    .select({ householdId: child.householdId })
    .from(child)
    .where(eq(child.id, childId))
    .get();
  if (!row) throw new LedgerError("That child could not be found.");
  return row.householdId;
}

export function goalBalance(goalId: string): number {
  return (
    db
      .select({ total: sql<number>`coalesce(sum(${ledgerEntry.amountCents}), 0)` })
      .from(ledgerEntry)
      .where(eq(ledgerEntry.goalId, goalId))
      .get()?.total ?? 0
  );
}

export function listGoals(childId: string, includeFinished = false): GoalWithProgress[] {
  const rows = db
    .select()
    .from(goal)
    .where(
      includeFinished
        ? eq(goal.childId, childId)
        : and(eq(goal.childId, childId), eq(goal.status, "active")),
    )
    .orderBy(goal.sortOrder, goal.createdAt)
    .all();

  return rows.map((g) => {
    const saved = goalBalance(g.id);
    return {
      id: g.id,
      name: g.name,
      targetCents: g.targetCents,
      savedCents: saved,
      photoBlobId: g.photoBlobId,
      status: g.status,
      progressPct:
        g.targetCents > 0 ? Math.min(100, Math.round((saved / g.targetCents) * 100)) : 0,
      remainingCents: Math.max(0, g.targetCents - saved),
    };
  });
}

/**
 * Move money from general savings into a goal.
 *
 * Both entries land in the savings account; only `goalId` differs. That keeps
 * the real savings balance untouched while the general pot shrinks, which is
 * exactly the mental model — the money has not gone anywhere, it has been
 * spoken for.
 */
export function earmark(
  childId: string,
  goalId: string,
  amountCents: number,
  actorUserId?: string,
): void {
  if (amountCents <= 0) throw new LedgerError("Enter a positive amount.");

  const target = db
    .select()
    .from(goal)
    .where(and(eq(goal.id, goalId), eq(goal.childId, childId)))
    .get();
  if (!target) throw new LedgerError("That goal could not be found.");

  const balances = getBalances(childId);
  if (balances.savingsGeneral < amountCents) {
    throw new LedgerError(
      `Only ${balances.savingsGeneral / 100} is unassigned in savings.`,
    );
  }

  const savings = db
    .select()
    .from(account)
    .where(and(eq(account.childId, childId), eq(account.type, "savings")))
    .get();
  if (!savings) throw new LedgerError("No savings account.");

  const householdId = householdIdFor(childId);
  const groupId = crypto.randomUUID();
  const now = Date.now();

  // Written directly rather than through recordTransaction because the account
  // balance genuinely does not change — only which bucket holds the money.
  db.transaction((tx) => {
    tx.insert(ledgerEntry)
      .values({
        householdId,
        childId,
        accountId: savings.id,
        goalId: null,
        amountCents: -amountCents,
        type: "earmark_out",
        occurredAt: now,
        description: `Set aside for ${target.name}`,
        actorUserId: actorUserId ?? null,
        source: "manual",
        transferGroupId: groupId,
      })
      .run();

    tx.insert(ledgerEntry)
      .values({
        householdId,
        childId,
        accountId: savings.id,
        goalId,
        amountCents,
        type: "earmark_in",
        occurredAt: now,
        description: `Set aside for ${target.name}`,
        actorUserId: actorUserId ?? null,
        source: "manual",
        transferGroupId: groupId,
      })
      .run();
  });

  maybeMarkAchieved(goalId);
}

/** Return goal money to the general pot. "Breaking a goal" is a real moment. */
export function unearmark(
  childId: string,
  goalId: string,
  amountCents: number,
  actorUserId?: string,
): void {
  if (amountCents <= 0) throw new LedgerError("Enter a positive amount.");

  const saved = goalBalance(goalId);
  if (saved < amountCents) {
    throw new LedgerError(`Only ${saved / 100} is set aside for that goal.`);
  }

  const target = db.select().from(goal).where(eq(goal.id, goalId)).get();
  const savings = db
    .select()
    .from(account)
    .where(and(eq(account.childId, childId), eq(account.type, "savings")))
    .get();
  if (!target || !savings) throw new LedgerError("Goal or savings account missing.");

  const householdId = householdIdFor(childId);
  const groupId = crypto.randomUUID();
  const now = Date.now();

  db.transaction((tx) => {
    tx.insert(ledgerEntry)
      .values({
        householdId,
        childId,
        accountId: savings.id,
        goalId,
        amountCents: -amountCents,
        type: "earmark_out",
        occurredAt: now,
        description: `Taken back from ${target.name}`,
        actorUserId: actorUserId ?? null,
        source: "manual",
        transferGroupId: groupId,
      })
      .run();

    tx.insert(ledgerEntry)
      .values({
        householdId,
        childId,
        accountId: savings.id,
        goalId: null,
        amountCents,
        type: "earmark_in",
        occurredAt: now,
        description: `Taken back from ${target.name}`,
        actorUserId: actorUserId ?? null,
        source: "manual",
        transferGroupId: groupId,
      })
      .run();
  });
}

function maybeMarkAchieved(goalId: string) {
  const target = db.select().from(goal).where(eq(goal.id, goalId)).get();
  if (!target || target.status !== "active") return;

  if (goalBalance(goalId) >= target.targetCents) {
    db.update(goal)
      .set({ status: "achieved", achievedAt: Date.now() })
      .where(eq(goal.id, goalId))
      .run();
  }
}

/** Spend a completed goal: the money leaves savings and the goal is archived. */
export function spendGoal(
  childId: string,
  goalId: string,
  description: string,
  actorUserId?: string,
): void {
  const target = db
    .select()
    .from(goal)
    .where(and(eq(goal.id, goalId), eq(goal.childId, childId)))
    .get();
  if (!target) throw new LedgerError("That goal could not be found.");

  const saved = goalBalance(goalId);
  if (saved <= 0) throw new LedgerError("There is nothing set aside for that goal.");

  const savings = db
    .select()
    .from(account)
    .where(and(eq(account.childId, childId), eq(account.type, "savings")))
    .get();
  if (!savings) throw new LedgerError("No savings account.");

  const householdId = householdIdFor(childId);

  db.transaction((tx) => {
    tx.insert(ledgerEntry)
      .values({
        householdId,
        childId,
        accountId: savings.id,
        goalId,
        amountCents: -saved,
        type: "purchase",
        occurredAt: Date.now(),
        description,
        actorUserId: actorUserId ?? null,
        source: "manual",
      })
      .run();

    tx.update(account)
      .set({ balanceCents: savings.balanceCents - saved })
      .where(eq(account.id, savings.id))
      .run();

    tx.update(goal)
      .set({ status: "achieved", achievedAt: target.achievedAt ?? Date.now() })
      .where(eq(goal.id, goalId))
      .run();
  });
}
