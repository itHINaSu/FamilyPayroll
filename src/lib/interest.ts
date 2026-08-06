import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { account, child, interestAccrual, ledgerEntry } from "@/db/schema";
import { fromIsoDate, todayInHousehold, type IsoDate } from "@/lib/dates";
import { recordTransaction } from "@/lib/ledger";
import { dailyAccrualMicroCents, microCentsToCents } from "@/lib/money";
import { resolvePolicy } from "@/lib/policy";

/**
 * Interest (SPEC §6.4).
 *
 * Accrues daily, posts monthly — which is what real banks do, and is also what
 * makes the rate impossible to game. Because checking-to-savings transfers are
 * free, an end-of-period basis would let a child park everything in savings the
 * night before posting; with daily accrual, one day parked earns exactly one
 * day of interest.
 *
 * Accrual is in integer micro-cents because a $5 balance at 12% APR earns 0.164
 * cents a day. Rounding daily would pay that child nothing, forever.
 */

export function accrueDaily(onDate: IsoDate = todayInHousehold()): number {
  const children = db.select().from(child).where(eq(child.status, "active")).all();
  let accrued = 0;

  for (const c of children) {
    const policy = resolvePolicy(c.householdId, c.id, onDate);
    if (!policy.interest.enabled) continue;

    for (const accountType of policy.interest.accounts) {
      const acct = db
        .select()
        .from(account)
        .where(and(eq(account.childId, c.id), eq(account.type, accountType)))
        .get();
      if (!acct) continue;

      const already = db
        .select({ id: interestAccrual.id })
        .from(interestAccrual)
        .where(
          and(
            eq(interestAccrual.accountId, acct.id),
            eq(interestAccrual.accrualDate, onDate),
          ),
        )
        .get();
      if (already) continue; // idempotent: a restart cannot double-accrue

      // Compounding means unposted accrual joins the basis it accrues against.
      const unposted =
        policy.interest.compounding === "compound" ? unpostedMicroCents(acct.id) : 0;

      const basis = acct.balanceCents + microCentsToCents(unposted);
      if (basis <= 0) continue;

      const micro = dailyAccrualMicroCents(basis, policy.interest.annualRateBp);
      if (micro <= 0) continue;

      db.insert(interestAccrual)
        .values({
          childId: c.id,
          accountId: acct.id,
          accrualDate: onDate,
          basisBalanceCents: basis,
          annualRateBp: policy.interest.annualRateBp,
          accruedMicroCents: micro,
        })
        .run();

      accrued++;
    }
  }

  return accrued;
}

function unpostedMicroCents(accountId: string): number {
  return (
    db
      .select({
        total: sql<number>`coalesce(sum(${interestAccrual.accruedMicroCents}), 0)`,
      })
      .from(interestAccrual)
      .where(
        and(eq(interestAccrual.accountId, accountId), isNull(interestAccrual.postedAt)),
      )
      .get()?.total ?? 0
  );
}

/**
 * Post accumulated interest as a ledger entry, once a month.
 *
 * Rounding to cents happens exactly once, here, against the whole month's
 * accrual — never per day.
 */
export function postMonthlyInterest(onDate: IsoDate = todayInHousehold()): number {
  const dayOfMonth = fromIsoDate(onDate).getDate();
  const children = db.select().from(child).where(eq(child.status, "active")).all();
  let posted = 0;

  for (const c of children) {
    const policy = resolvePolicy(c.householdId, c.id, onDate);
    if (!policy.interest.enabled) continue;
    if (dayOfMonth !== policy.interest.postingDayOfMonth) continue;

    for (const accountType of policy.interest.accounts) {
      const acct = db
        .select()
        .from(account)
        .where(and(eq(account.childId, c.id), eq(account.type, accountType)))
        .get();
      if (!acct) continue;

      const micro = unpostedMicroCents(acct.id);
      const cents = microCentsToCents(micro);
      if (cents <= 0) continue;

      recordTransaction({
        childId: c.id,
        accountType,
        amountCents: cents,
        type: "interest",
        description: "Interest earned",
        memo: `${(policy.interest.annualRateBp / 100).toFixed(2)}% a year, ${
          policy.interest.compounding === "compound" ? "compounded" : "simple"
        }`,
        source: "system",
        // Interest on earmarked savings posts to the general pot, not the goal.
        goalId: null,
      });

      db.update(interestAccrual)
        .set({ postedAt: Date.now() })
        .where(
          and(eq(interestAccrual.accountId, acct.id), isNull(interestAccrual.postedAt)),
        )
        .run();

      posted++;
    }
  }

  return posted;
}

/** Lifetime interest, derived from the ledger so it cannot drift. */
export function lifetimeInterestCents(childId: string): number {
  return (
    db
      .select({ total: sql<number>`coalesce(sum(${ledgerEntry.amountCents}), 0)` })
      .from(ledgerEntry)
      .where(and(eq(ledgerEntry.childId, childId), eq(ledgerEntry.type, "interest")))
      .get()?.total ?? 0
  );
}

/** Interest accrued but not yet paid — the number that ticks up every day. */
export function pendingInterestCents(childId: string): number {
  const micro =
    db
      .select({
        total: sql<number>`coalesce(sum(${interestAccrual.accruedMicroCents}), 0)`,
      })
      .from(interestAccrual)
      .where(and(eq(interestAccrual.childId, childId), isNull(interestAccrual.postedAt)))
      .get()?.total ?? 0;

  return microCentsToCents(micro);
}
