import "server-only";

import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  billInstance,
  child,
  jobClaim,
  job,
  payPeriod,
  paystub,
  paystubLine,
  type PayPeriodStatus,
} from "@/db/schema";
import { addDays, payPeriodFor, todayInHousehold, type IsoDate } from "@/lib/dates";
import { recordTransaction } from "@/lib/ledger";
import { allocate, formatCents } from "@/lib/money";
import { resolvePolicy, type Policy } from "@/lib/policy";
import { evaluatePeriod, listResponsibilities } from "@/lib/responsibilities";

/**
 * Payroll (SPEC §6.1–6.2).
 *
 * The shape of this engine follows one rule: **if a parent does nothing, the
 * right thing still happens.** Payroll drafts itself at period end and posts
 * itself at pay date. A parent may revise the draft in between, but their
 * inaction is not a failure mode.
 *
 * Nothing touches the ledger until posting, so a revision has nothing to
 * reverse — the draft is simply recomputed.
 */

export type DraftLine = {
  kind: "responsibility" | "job" | "past_due_recovery";
  refId: string | null;
  label: string;
  potentialCents: number;
  earnedCents: number;
  detail: Record<string, unknown>;
};

export type DraftResult = {
  potentialCents: number;
  earnedCents: number;
  bonusCents: number;
  grossCents: number;
  pastDueRecoveredCents: number;
  netCents: number;
  allocations: Record<"checking" | "savings" | "generosity", number>;
  /** Job pay routed straight to checking, bypassing allocation. */
  bonusDirectToCheckingCents: number;
  lines: DraftLine[];
  policy: Policy;
};

export function totalPastDue(childId: string): number {
  const rows = db
    .select()
    .from(billInstance)
    .where(
      and(
        eq(billInstance.childId, childId),
        inArray(billInstance.status, ["past_due", "partially_paid"]),
      ),
    )
    .all();

  return rows.reduce((sum, r) => sum + (r.amountCents - r.paidCents), 0);
}

/** Compute a pay stub without writing anything. */
export function computeDraft(
  householdId: string,
  childId: string,
  startDate: IsoDate,
  endDate: IsoDate,
): DraftResult {
  const policy = resolvePolicy(householdId, childId, endDate);
  const lines: DraftLine[] = [];

  let potentialCents = 0;
  let earnedCents = 0;

  for (const r of listResponsibilities(childId)) {
    if (r.effectiveFrom > endDate) continue;

    const result = evaluatePeriod(r, childId, startDate, endDate, policy.completion.mode);
    potentialCents += result.potentialCents;
    earnedCents += result.earnedCents;

    lines.push({
      kind: "responsibility",
      refId: r.id,
      label: r.name,
      potentialCents: result.potentialCents,
      earnedCents: result.earnedCents,
      detail: {
        completed: result.completed,
        chances: result.chances,
        excused: result.excused,
        cadence: r.cadence,
      },
    });
  }

  // Bonus pay is a separate line and is deliberately NOT part of potential pay:
  // a child who claims no jobs has not failed to earn anything.
  const claims = db
    .select({ claim: jobClaim, jobRow: job })
    .from(jobClaim)
    .innerJoin(job, eq(jobClaim.jobId, job.id))
    .where(
      and(
        eq(jobClaim.childId, childId),
        eq(jobClaim.status, "approved"),
        // Only claims not already carried on an earlier stub.
        isNull(jobClaim.payPeriodId),
      ),
    )
    .all();

  let bonusCents = 0;
  let bonusDirectToCheckingCents = 0;

  for (const { claim, jobRow } of claims) {
    bonusCents += claim.valueCentsSnapshot;

    const routeDirect =
      jobRow.allocationMode === "checking_only" ||
      policy.allocation.jobPayMode === "checking_only";
    if (routeDirect) bonusDirectToCheckingCents += claim.valueCentsSnapshot;

    lines.push({
      kind: "job",
      refId: claim.id,
      label: jobRow.name,
      potentialCents: 0,
      earnedCents: claim.valueCentsSnapshot,
      detail: { jobId: jobRow.id, direct: routeDirect },
    });
  }

  const grossCents = earnedCents + bonusCents;

  // Past due comes off the top, capped by policy so a child in arrears is not
  // guaranteed a $0.00 payday when the parent has chosen otherwise.
  const outstanding =
    policy.bills.pastDueRecovery === "from_gross_before_allocation"
      ? totalPastDue(childId)
      : 0;

  const recoverable = Math.floor(
    (grossCents * policy.bills.pastDueMaxRecoveryPct) / 100,
  );
  const pastDueRecoveredCents = Math.max(0, Math.min(outstanding, recoverable));

  if (pastDueRecoveredCents > 0) {
    lines.push({
      kind: "past_due_recovery",
      refId: null,
      label: "Past due recovered",
      potentialCents: 0,
      earnedCents: -pastDueRecoveredCents,
      detail: { outstanding },
    });
  }

  const netCents = grossCents - pastDueRecoveredCents;

  // Direct-routed bonus money skips the split; the rest is allocated.
  const allocatable = Math.max(0, netCents - bonusDirectToCheckingCents);

  const allocations = allocate(
    allocatable,
    [
      { key: "checking" as const, pct: policy.allocation.checkingPct },
      { key: "savings" as const, pct: policy.allocation.savingsPct },
      { key: "generosity" as const, pct: policy.allocation.generosityPct },
    ],
    policy.allocation.roundingBucket,
  );

  allocations.checking += Math.min(bonusDirectToCheckingCents, netCents);

  return {
    potentialCents,
    earnedCents,
    bonusCents,
    grossCents,
    pastDueRecoveredCents,
    netCents,
    allocations,
    bonusDirectToCheckingCents,
    lines,
    policy,
  };
}

function upsertPeriod(
  childId: string,
  startDate: IsoDate,
  endDate: IsoDate,
  payDate: IsoDate,
) {
  const existing = db
    .select()
    .from(payPeriod)
    .where(and(eq(payPeriod.childId, childId), eq(payPeriod.startDate, startDate)))
    .get();

  if (existing) return existing;

  return db
    .insert(payPeriod)
    .values({ childId, startDate, endDate, payDate, status: "open" })
    .returning()
    .get();
}

/**
 * Draft (or re-draft) a pay stub for a period. Idempotent: running twice
 * recomputes the same draft rather than creating a second one.
 */
export function draftPaystub(
  householdId: string,
  childId: string,
  startDate: IsoDate,
  endDate: IsoDate,
  payDate: IsoDate,
  revisedByUserId?: string,
): string {
  const period = upsertPeriod(childId, startDate, endDate, payDate);
  const draft = computeDraft(householdId, childId, startDate, endDate);
  const policy = draft.policy;

  const windowEnds = Math.max(
    new Date(`${payDate}T00:00:00`).getTime(),
    Date.now() + policy.pay.minRevisionHours * 3_600_000,
  );

  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(paystub)
      .where(eq(paystub.payPeriodId, period.id))
      .get();

    if (existing?.status === "posted") {
      throw new Error("That pay period has already been posted.");
    }

    const values = {
      childId,
      payPeriodId: period.id,
      status: "draft" as const,
      potentialCents: draft.potentialCents,
      earnedCents: draft.earnedCents,
      bonusCents: draft.bonusCents,
      grossCents: draft.grossCents,
      pastDueRecoveredCents: draft.pastDueRecoveredCents,
      netCents: draft.netCents,
      allocationsJson: draft.allocations,
      policySnapshotJson: policy,
      computedAt: Date.now(),
      revisionWindowEndsAt: windowEnds,
    };

    let stubId: string;

    if (existing) {
      tx.update(paystub)
        .set({
          ...values,
          revisionCount: existing.revisionCount + 1,
          lastRevisedByUserId: revisedByUserId ?? existing.lastRevisedByUserId,
        })
        .where(eq(paystub.id, existing.id))
        .run();
      tx.delete(paystubLine).where(eq(paystubLine.paystubId, existing.id)).run();
      stubId = existing.id;
    } else {
      stubId = tx.insert(paystub).values(values).returning({ id: paystub.id }).get().id;
    }

    draft.lines.forEach((line, index) => {
      tx.insert(paystubLine)
        .values({
          paystubId: stubId,
          kind: line.kind,
          refId: line.refId,
          label: line.label,
          potentialCents: line.potentialCents,
          earnedCents: line.earnedCents,
          detailJson: line.detail,
          sortOrder: index,
        })
        .run();
    });

    tx.update(payPeriod)
      .set({ status: "drafted" as PayPeriodStatus })
      .where(eq(payPeriod.id, period.id))
      .run();

    return stubId;
  });
}

/**
 * Post a draft: write the ledger entries, freeze the stub.
 *
 * After this the stub is immutable (invariant I5, enforced by trigger). Later
 * corrections are adjustment entries referencing it, never edits to it.
 */
export function postPaystub(paystubId: string, actorUserId?: string): void {
  const stub = db.select().from(paystub).where(eq(paystub.id, paystubId)).get();
  if (!stub) throw new Error("That pay stub could not be found.");
  if (stub.status === "posted") return; // idempotent

  const allocations = stub.allocationsJson as Record<string, number>;
  const lines = db
    .select()
    .from(paystubLine)
    .where(eq(paystubLine.paystubId, paystubId))
    .all();

  for (const [accountType, amount] of Object.entries(allocations)) {
    if (amount === 0) continue;
    recordTransaction({
      childId: stub.childId,
      accountType: accountType as "checking" | "savings" | "generosity",
      amountCents: amount,
      type: "payroll_deposit",
      description: `Payroll — net ${formatCents(stub.netCents)}`,
      occurredAt: Date.now(),
      actorUserId: actorUserId ?? null,
      source: "payroll",
      paystubId,
      allowNegative: true,
    });
  }

  if (stub.pastDueRecoveredCents > 0) {
    applyPastDueRecovery(stub.childId, stub.pastDueRecoveredCents, paystubId);
  }

  // Mark the job claims this stub paid, so the next draft does not pick them up.
  const claimIds = lines
    .filter((l) => l.kind === "job" && l.refId)
    .map((l) => l.refId as string);

  if (claimIds.length) {
    db.update(jobClaim)
      .set({ payPeriodId: stub.payPeriodId })
      .where(inArray(jobClaim.id, claimIds))
      .run();
  }

  db.update(paystub)
    .set({ status: "posted", postedAt: Date.now() })
    .where(eq(paystub.id, paystubId))
    .run();

  db.update(payPeriod)
    .set({ status: "posted" })
    .where(eq(payPeriod.id, stub.payPeriodId))
    .run();
}

/** Apply a recovered amount against the oldest outstanding bills first. */
function applyPastDueRecovery(childId: string, amountCents: number, paystubId: string) {
  let remaining = amountCents;

  const outstanding = db
    .select()
    .from(billInstance)
    .where(
      and(
        eq(billInstance.childId, childId),
        inArray(billInstance.status, ["past_due", "partially_paid"]),
      ),
    )
    .orderBy(asc(billInstance.dueDate))
    .all();

  for (const instance of outstanding) {
    if (remaining <= 0) break;
    const owed = instance.amountCents - instance.paidCents;
    const take = Math.min(owed, remaining);

    db.update(billInstance)
      .set({
        paidCents: instance.paidCents + take,
        status: instance.paidCents + take >= instance.amountCents ? "paid" : "past_due",
        paidAt: Date.now(),
      })
      .where(eq(billInstance.id, instance.id))
      .run();

    remaining -= take;
  }

  recordTransaction({
    childId,
    accountType: "held",
    amountCents,
    type: "past_due_recovery",
    description: "Past due rent recovered from payroll",
    source: "payroll",
    paystubId,
    allowNegative: true,
  });
}

/**
 * The scheduled half: draft periods that have closed, post drafts whose pay date
 * has arrived. Runs on every scheduler tick, so a container that was asleep
 * catches up rather than skipping a payday.
 */
export function runPayrollCycle(now: IsoDate = todayInHousehold()): {
  drafted: string[];
  posted: string[];
} {
  const drafted: string[] = [];
  const posted: string[] = [];

  const children = db
    .select()
    .from(child)
    .where(eq(child.status, "active"))
    .all();

  for (const c of children) {
    const policy = resolvePolicy(c.householdId, c.id, now);

    // The period that ended most recently: look back one period from today.
    const previous = payPeriodFor(addDays(now, -1), {
      cadence: policy.pay.cadence,
      periodStartDay: policy.pay.periodStartDay,
      payDateOffsetDays: policy.pay.payDateOffsetDays,
    });

    if (previous.endDate < now) {
      const existing = db
        .select()
        .from(payPeriod)
        .where(
          and(eq(payPeriod.childId, c.id), eq(payPeriod.startDate, previous.startDate)),
        )
        .get();

      if (!existing || existing.status === "open" || existing.status === "drafted") {
        try {
          drafted.push(
            draftPaystub(
              c.householdId,
              c.id,
              previous.startDate,
              previous.endDate,
              previous.payDate,
            ),
          );
        } catch {
          // Already posted; nothing to do.
        }
      }
    }
  }

  // Post every draft whose pay date has arrived.
  const due = db
    .select({ stub: paystub, period: payPeriod })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .where(and(eq(paystub.status, "draft"), lte(payPeriod.payDate, now)))
    .all();

  for (const { stub } of due) {
    postPaystub(stub.id);
    posted.push(stub.id);
  }

  return { drafted, posted };
}
