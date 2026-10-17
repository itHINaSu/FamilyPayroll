import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  billInstance,
  child,
  household,
  jobClaim,
  job,
  payPeriod,
  paystub,
  paystubLine,
  type PayPeriodStatus,
} from "@/db/schema";
import { addDays, daysBetween, payPeriodFor, todayInHousehold, type IsoDate } from "@/lib/dates";
import { recordTransaction } from "@/lib/ledger";
import { allocate, formatCents } from "@/lib/money";
import { policyResolver, resolvePolicy, type Policy } from "@/lib/policy";
import { evaluatePeriod, listResponsibilities, valuationFor } from "@/lib/responsibilities";

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

/** The pay schedule as it stood on each date, for one child. */
type Schedule = (onDate: IsoDate) => { startDate: IsoDate; endDate: IsoDate; payDate: IsoDate };

function scheduleFor(householdId: string, childId: string): Schedule {
  const policyOn = policyResolver(householdId, childId);
  return (onDate) => {
    const pay = policyOn(onDate).pay;
    return payPeriodFor(onDate, {
      cadence: pay.cadence,
      periodStartDay: pay.periodStartDay,
      payDateOffsetDays: pay.payDateOffsetDays,
    });
  };
}

/** The first day on or after `from` that the schedule in force that day ends a period on. */
function nextPeriodEnd(schedule: Schedule, from: IsoDate): IsoDate {
  let d = from;
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    if (schedule(d).endDate === d) return d;
  }
  throw new Error(`No pay period ends after ${from}.`);
}

/**
 * The period that starts on `start`: to the schedule's next period end, or
 * the one after when that leaves only 1–3 days — a tiny leftover isn't paid
 * alone, it joins the next period, which runs long.
 */
function periodStarting(schedule: Schedule, start: IsoDate): CoveredPeriod {
  let end = nextPeriodEnd(schedule, start);
  if (daysBetween(start, end) + 1 <= 3) end = nextPeriodEnd(schedule, addDays(end, 1));
  return { startDate: start, endDate: end, payDate: schedule(end).payDate, alreadyPaid: false };
}

/**
 * Whether an unposted period is the one the schedule now says covers its
 * days. One drafted before a schedule change isn't, and must not be posted:
 * its days belong to the periods that cover them now.
 */
export function matchesSchedule(
  householdId: string,
  childId: string,
  p: { startDate: IsoDate; endDate: IsoDate },
): boolean {
  const now = coveredPeriodFor(householdId, childId, p.endDate);
  return now.startDate === p.startDate && now.endDate === p.endDate;
}

/**
 * Drop unposted periods that no longer match the schedule — drafted before a
 * schedule change. Their days roll into the periods that now cover them, so
 * they must not be posted (by hand or on their old payday). Returns how many
 * were dropped.
 */
export function discardStaleDrafts(householdId: string): number {
  const rows = db
    .select({
      id: payPeriod.id,
      childId: payPeriod.childId,
      startDate: payPeriod.startDate,
      endDate: payPeriod.endDate,
    })
    .from(payPeriod)
    .innerJoin(child, eq(payPeriod.childId, child.id))
    .where(and(eq(child.householdId, householdId), inArray(payPeriod.status, ["open", "drafted"])))
    .all();
  const stale = rows.filter((r) => !matchesSchedule(householdId, r.childId, r));
  if (stale.length > 0) {
    db.delete(payPeriod).where(inArray(payPeriod.id, stale.map((r) => r.id))).run();
  }
  return stale.length;
}

export type CoveredPeriod = {
  startDate: IsoDate;
  endDate: IsoDate;
  payDate: IsoDate;
  /** Every day of the schedule's period has already been paid. */
  alreadyPaid: boolean;
};

/**
 * The periods not yet paid for one child, oldest first, through the one
 * covering `onDate`.
 *
 * The schedule decides where each period ends and when it pays. Where the
 * first one starts follows what has actually been paid, so no day is ever
 * paid twice and none is skipped:
 *  - normally, the day after the last drafted or posted period — which,
 *    once a schedule is established, is simply the schedule's own start;
 *  - after the schedule changes, the transition period reaches back to pick
 *    up days not yet paid, or starts later to leave out days already paid;
 *  - a child's very first period starts the day payroll was started (Start
 *    payroll, or a history reset), or when their expectations began;
 *  - a leftover of 1–3 days joins the next period (a long week) rather than
 *    being paid alone; 4 or more stand as a period of their own — a short
 *    week, or a whole one. One that has already ended is due now, ahead of
 *    the period covering `onDate`, never folded into it.
 * It never reaches back before payroll was last started, nor more than one
 * extra period's length — a long gap (an archived stretch) isn't owed.
 */
export function unpaidPeriods(
  householdId: string,
  childId: string,
  onDate: IsoDate,
): CoveredPeriod[] {
  return walkUnpaid(householdId, childId, onDate).periods;
}

function walkUnpaid(householdId: string, childId: string, onDate: IsoDate) {
  const schedule = scheduleFor(householdId, childId);
  const natural = schedule(onDate);

  // Posted periods are paid, this one included if it was paid early. A
  // waiting draft of an earlier period counts too — unless the schedule has
  // since changed under it, in which case its days are still open and roll
  // into these periods (and the stale draft is discarded).
  const earlier = db
    .select({ endDate: payPeriod.endDate, status: payPeriod.status })
    .from(payPeriod)
    .where(
      and(
        eq(payPeriod.childId, childId),
        inArray(payPeriod.status, ["drafted", "posted"]),
        lte(payPeriod.endDate, natural.endDate),
      ),
    )
    .orderBy(desc(payPeriod.endDate))
    .all();
  const lastPaidEnd =
    earlier.find((p) =>
      p.status === "posted"
        ? true
        : p.endDate < natural.endDate && schedule(p.endDate).endDate === p.endDate,
    )?.endDate ?? null;

  const started =
    db
      .select({ on: household.payrollResumedOn })
      .from(household)
      .where(eq(household.id, householdId))
      .get()?.on ?? null;

  let start: IsoDate;
  if (lastPaidEnd) {
    start = addDays(lastPaidEnd, 1);
  } else if (started) {
    start = started;
  } else {
    const began = listResponsibilities(childId)
      .map((r) => r.effectiveFrom)
      .sort()[0];
    start = began && began < natural.startDate ? began : natural.startDate;
  }

  if (started && start < started) start = started;
  const length = daysBetween(natural.startDate, natural.endDate) + 1;
  const earliest = addDays(natural.startDate, -length);
  if (start < earliest) start = earliest;

  const periods: CoveredPeriod[] = [];
  if (start <= natural.endDate) {
    for (let s = start; ; ) {
      const p = periodStarting(schedule, s);
      periods.push(p);
      if (p.endDate >= onDate) break;
      s = addDays(p.endDate, 1);
    }
  }
  return { schedule, natural, periods };
}

/**
 * The pay period covering `onDate` for one child — the last of
 * unpaidPeriods, or the schedule's own period when it's already been paid.
 */
export function coveredPeriodFor(
  householdId: string,
  childId: string,
  onDate: IsoDate,
): CoveredPeriod {
  const { natural, periods } = walkUnpaid(householdId, childId, onDate);
  return periods.at(-1) ?? { ...natural, alreadyPaid: true };
}

/**
 * What's owed and coming for one child: the unpaid periods through today's,
 * then `more` after it — for showing what a schedule will do.
 */
export function periodsAhead(
  householdId: string,
  childId: string,
  today: IsoDate,
  more = 1,
): CoveredPeriod[] {
  const { schedule, natural, periods } = walkUnpaid(householdId, childId, today);
  const out = [...periods];
  for (let i = 0; i < more; i++) {
    out.push(periodStarting(schedule, addDays(out.at(-1)?.endDate ?? natural.endDate, 1)));
  }
  return out;
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

    const result = evaluatePeriod(r, childId, startDate, endDate, policy.completion.mode, undefined, {
      valuation: valuationFor(policy.pay.cadence),
    });
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
        missed: result.missed,
        payMode: r.payMode,
        allOrNothing: r.allOrNothing,
        // Shown on the stub so the conversation about lost pay has specifics.
        misses: result.misses.map((m) => ({ date: m.date, note: m.note })),
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

  if (existing) {
    // A period drafted early, before a schedule change, follows the schedule.
    if (existing.status !== "posted" && (existing.endDate !== endDate || existing.payDate !== payDate)) {
      return db
        .update(payPeriod)
        .set({ endDate, payDate })
        .where(eq(payPeriod.id, existing.id))
        .returning()
        .get();
    }
    return existing;
  }

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
  // An unposted period over the same days but starting elsewhere — an early
  // draft from before a schedule change — is replaced, never paid alongside.
  db.delete(payPeriod)
    .where(
      and(
        eq(payPeriod.childId, childId),
        ne(payPeriod.startDate, startDate),
        inArray(payPeriod.status, ["open", "drafted"]),
        lte(payPeriod.startDate, endDate),
        gte(payPeriod.endDate, startDate),
      ),
    )
    .run();

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
 * catches up rather than skipping a payday — and again right after a pay
 * schedule change, so a period the new schedule says is already due is paid
 * then rather than at tomorrow's run. Pass `householdId` to do one family.
 */
export function runPayrollCycle(
  now: IsoDate = todayInHousehold(),
  opts: { householdId?: string } = {},
): {
  drafted: string[];
  posted: string[];
} {
  const drafted: string[] = [];
  const posted: string[] = [];

  const children = db
    .select()
    .from(child)
    .where(
      and(
        eq(child.status, "active"),
        opts.householdId ? eq(child.householdId, opts.householdId) : undefined,
      ),
    )
    .all();

  const resumedOn = new Map(
    db
      .select({ id: household.id, resumedOn: household.payrollResumedOn })
      .from(household)
      .all()
      .map((h) => [h.id, h.resumedOn]),
  );

  for (const c of children) {
    // Every unpaid period that has ended, oldest first: normally just the one
    // that ended yesterday, but after a schedule change (or a missed run) an
    // earlier one can be waiting too. Their starts follow what's been paid,
    // so nothing is skipped or repeated (see unpaidPeriods).
    const ended = unpaidPeriods(c.householdId, c.id, addDays(now, -1)).filter(
      (p) => p.endDate < now,
    );

    for (const p of ended) {
      // A period that ended before payroll was last resumed happened entirely
      // while paused — there is nothing to pay for it, so it is never drafted.
      const resumed = resumedOn.get(c.householdId);
      if (resumed && p.endDate < resumed) continue;

      const existing = db
        .select()
        .from(payPeriod)
        .where(and(eq(payPeriod.childId, c.id), eq(payPeriod.startDate, p.startDate)))
        .get();

      if (!existing || existing.status === "open" || existing.status === "drafted") {
        try {
          drafted.push(draftPaystub(c.householdId, c.id, p.startDate, p.endDate, p.payDate));
        } catch (error) {
          // Already posted is nothing to do. Anything else (settings that
          // can't be paid out, say) must not stop the other children's pay.
          if (!(error instanceof Error && error.message.includes("already been posted"))) {
            console.error(`[payroll] could not draft ${p.startDate}..${p.endDate} for ${c.id}:`, error);
          }
        }
      }
    }
  }

  // Post every draft whose pay date has arrived.
  const due = db
    .select({ stub: paystub, period: payPeriod, householdId: child.householdId })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .innerJoin(child, eq(paystub.childId, child.id))
    .where(
      and(
        eq(paystub.status, "draft"),
        lte(payPeriod.payDate, now),
        opts.householdId ? eq(child.householdId, opts.householdId) : undefined,
      ),
    )
    .all();

  for (const { stub, period, householdId } of due) {
    // Drafted under a schedule that has since changed: its days belong to
    // the periods that now cover them, so it's discarded rather than paid.
    if (!matchesSchedule(householdId, stub.childId, period)) {
      db.delete(payPeriod).where(eq(payPeriod.id, period.id)).run();
      continue;
    }
    postPaystub(stub.id);
    posted.push(stub.id);
  }

  return { drafted, posted };
}
