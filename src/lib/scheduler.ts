import "server-only";

import { createBackup } from "@/lib/backup";
import { config } from "@/lib/config";
import { reconcileAll } from "@/lib/ledger";
import { runPayrollCycle } from "@/lib/payroll";
import { runBillCycle } from "@/lib/bills";
import { accrueDaily, postMonthlyInterest } from "@/lib/interest";
import { expireStaleClaims } from "@/lib/jobs";
import { sendDailyNudges } from "@/lib/nudges";
import { getSecret, setSecret } from "@/lib/secrets";
import { pruneExpiredMfaChallenges, pruneExpiredSessions } from "@/lib/auth/session";

/**
 * In-process scheduler.
 *
 * A single container serving a single household does not need a queue or a
 * separate worker. A one-minute tick that asks "has today's work run yet?" is
 * enough, and it has a property a cron expression does not: if the container was
 * asleep at 03:00, the job still runs when it wakes rather than being skipped
 * until tomorrow. For payroll and bills in later phases that difference matters
 * — a missed run must never silently cost a child a payday.
 *
 * Last-run state lives in the database, so a restart cannot cause a double-run.
 */

const TICK_MS = 60_000;

type DailyTask = {
  name: string;
  hour: number;
  run: () => void;
};

const tasks: DailyTask[] = [
  {
    /**
     * The money cycle, in the order SPEC §6.3 requires: payroll posts first,
     * then bills draw. A child is always paid before a bill hits.
     *
     * Runs early so a bill due today is collected against today's paycheck.
     * Each step is idempotent, so a container that was asleep for a weekend
     * catches up rather than skipping a payday.
     */
    name: "money_cycle",
    hour: 1,
    run: () => {
      const payroll = runPayrollCycle();
      const bills = runBillCycle();
      const accrued = accrueDaily();
      const interestPosted = postMonthlyInterest();
      const expired = expireStaleClaims();
      void sendDailyNudges();

      console.log(
        `[scheduler] payroll: ${payroll.drafted.length} drafted, ${payroll.posted.length} posted; ` +
          `bills: ${bills.length} processed; interest: ${accrued} accrued, ${interestPosted} posted; ` +
          `${expired} stale job claims expired`,
      );
    },
  },
  {
    name: "nightly_backup",
    hour: config.backupCronHour,
    run: () => {
      const file = createBackup();
      const pruned = pruneExpiredSessions();
      const prunedMfa = pruneExpiredMfaChallenges();
      console.log(
        `[scheduler] backup written: ${file} (pruned ${pruned} sessions, ${prunedMfa} MFA challenges)`,
      );
    },
  },
  {
    /**
     * Invariant I6. Every account's cached balance must equal the sum of its
     * ledger entries. Drift means some write path bypassed the ledger service,
     * which is a bug to find rather than a number to quietly repair — so this
     * reports loudly and changes nothing.
     */
    name: "reconcile_balances",
    hour: config.backupCronHour,
    run: () => {
      const drifted = reconcileAll();
      if (drifted.length === 0) {
        console.log("[scheduler] reconciliation clean");
        return;
      }
      console.error(
        `[scheduler] BALANCE DRIFT on ${drifted.length} account(s) — invariant I6 violated`,
      );
      for (const d of drifted) {
        console.error(
          `[scheduler]   account ${d.accountId}: cached ${d.cached}, ledger ${d.derived}`,
        );
      }
    },
  },
];

function localDateKey(): string {
  // Uses the container's TZ, which is why TZ is a load-bearing variable.
  return new Date().toLocaleDateString("en-CA");
}

function tick() {
  const today = localDateKey();
  const hour = new Date().getHours();

  for (const task of tasks) {
    const key = `last_run_${task.name}`;
    if (getSecret(key) === today) continue;
    if (hour < task.hour) continue;

    try {
      task.run();
      setSecret(key, today);
    } catch (error) {
      // Never let one failing task stop the tick loop.
      console.error(`[scheduler] task "${task.name}" failed:`, error);
    }
  }
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  setInterval(tick, TICK_MS).unref();
  console.log(`[scheduler] started (timezone: ${config.timezone})`);
}
