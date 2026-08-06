import "server-only";

import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { job, jobClaim, type RepeatRule } from "@/db/schema";
import { addDays, todayInHousehold } from "@/lib/dates";
import { LedgerError } from "@/lib/ledger";
import { trustLevelFor } from "@/lib/trust";

/**
 * The job board (SPEC §4.5).
 *
 * Bonus work: claimed rather than assigned, paid per job, and deliberately not
 * part of potential pay — a child who claims nothing has not failed to earn
 * anything.
 *
 * A job may require a minimum trust level. That is the single sanctioned point
 * of contact between the two tracks and it is bounded by invariant I10: trust
 * can stop a child *claiming* work they are not ready for, and can never reduce
 * pay for work already done.
 */

export type JobRow = typeof job.$inferSelect;

function periodStart(rule: RepeatRule, repeatN: number | null): string | null {
  const today = todayInHousehold();
  switch (rule) {
    case "once":
      return null; // no window; the limit is lifetime
    case "weekly":
      return addDays(today, -7);
    case "monthly":
      return addDays(today, -30);
    case "every_n_days":
      return addDays(today, -(repeatN ?? 1));
  }
}

/** How many times this job has been taken inside its current repeat window. */
function claimsInWindow(j: JobRow, childId?: string): number {
  const since = periodStart(j.repeatRule, j.repeatN);

  const conditions = [
    eq(jobClaim.jobId, j.id),
    inArray(jobClaim.status, ["claimed", "submitted", "approved"]),
  ];
  if (j.limitScope === "per_child" && childId) {
    conditions.push(eq(jobClaim.childId, childId));
  }
  if (since) {
    conditions.push(gte(jobClaim.claimedAt, new Date(`${since}T00:00:00`).getTime()));
  }

  return db
    .select({ id: jobClaim.id })
    .from(jobClaim)
    .where(and(...conditions))
    .all().length;
}

export type JobAvailability = {
  job: JobRow;
  available: boolean;
  reason?: string;
  claimedByThisChild: boolean;
};

export function availableJobs(
  householdId: string,
  childId: string,
): JobAvailability[] {
  const jobs = db
    .select()
    .from(job)
    .where(and(eq(job.householdId, householdId), eq(job.active, true)))
    .all();

  return jobs
    .filter(
      (j) => !j.eligibleChildIds?.length || j.eligibleChildIds.includes(childId),
    )
    .map((j) => {
      const openClaim = db
        .select()
        .from(jobClaim)
        .where(
          and(
            eq(jobClaim.jobId, j.id),
            eq(jobClaim.childId, childId),
            inArray(jobClaim.status, ["claimed", "submitted"]),
          ),
        )
        .get();

      if (openClaim) {
        return { job: j, available: false, reason: "Already claimed", claimedByThisChild: true };
      }

      if (claimsInWindow(j, childId) >= j.limitCount) {
        return {
          job: j,
          available: false,
          reason: "Already taken for this period",
          claimedByThisChild: false,
        };
      }

      // Invariant I10: trust gates access to opportunity, nothing else.
      if (j.trustAreaId && j.minTrustLevel !== null) {
        const status = trustLevelFor(childId, j.trustAreaId);
        if (status.level.level < j.minTrustLevel) {
          return {
            job: j,
            available: false,
            reason: "Not ready for this one yet",
            claimedByThisChild: false,
          };
        }
      }

      return { job: j, available: true, claimedByThisChild: false };
    });
}

export function claimJob(jobId: string, childId: string): string {
  const j = db.select().from(job).where(eq(job.id, jobId)).get();
  if (!j || !j.active) throw new LedgerError("That job is no longer available.");

  const availability = availableJobs(j.householdId, childId).find(
    (a) => a.job.id === jobId,
  );
  if (!availability?.available) {
    throw new LedgerError(availability?.reason ?? "That job is not available.");
  }

  return db
    .insert(jobClaim)
    .values({
      jobId,
      childId,
      status: "claimed",
      // Frozen at claim time so editing the job later cannot rewrite owed pay.
      valueCentsSnapshot: j.valueCents,
      expiresAt: Date.now() + j.claimExpiryHours * 3_600_000,
    })
    .returning({ id: jobClaim.id })
    .get().id;
}

export function submitJobClaim(claimId: string): void {
  const claim = db.select().from(jobClaim).where(eq(jobClaim.id, claimId)).get();
  if (!claim) throw new LedgerError("That claim could not be found.");
  if (claim.status !== "claimed") throw new LedgerError("That claim is not open.");

  const j = db.select().from(job).where(eq(job.id, claim.jobId)).get();

  db.update(jobClaim)
    .set({
      // A job that needs no approval is done the moment it is submitted.
      status: j?.requiresApproval ? "submitted" : "approved",
      submittedAt: Date.now(),
      decidedAt: j?.requiresApproval ? null : Date.now(),
    })
    .where(eq(jobClaim.id, claimId))
    .run();
}

export function decideJobClaim(
  claimId: string,
  approved: boolean,
  actorUserId: string,
): void {
  db.update(jobClaim)
    .set({
      status: approved ? "approved" : "rejected",
      decidedByUserId: actorUserId,
      decidedAt: Date.now(),
    })
    .where(eq(jobClaim.id, claimId))
    .run();
}

/** Release claims nobody finished, so a job cannot be squatted on forever. */
export function expireStaleClaims(): number {
  const stale = db
    .select()
    .from(jobClaim)
    .where(eq(jobClaim.status, "claimed"))
    .all()
    .filter((c) => c.expiresAt < Date.now());

  for (const claim of stale) {
    db.update(jobClaim)
      .set({ status: "expired" })
      .where(eq(jobClaim.id, claim.id))
      .run();
  }

  return stale.length;
}

export function pendingJobClaims(householdId: string) {
  return db
    .select({ claim: jobClaim, jobRow: job })
    .from(jobClaim)
    .innerJoin(job, eq(jobClaim.jobId, job.id))
    .where(and(eq(job.householdId, householdId), eq(jobClaim.status, "submitted")))
    .orderBy(desc(jobClaim.submittedAt))
    .all();
}

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  once: "Once only",
  weekly: "Once a week",
  monthly: "Once a month",
  every_n_days: "Every N days",
};
