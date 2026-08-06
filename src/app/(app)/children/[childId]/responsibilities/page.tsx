import { notFound } from "next/navigation";

import { Alert, Card } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { eachDate, payPeriodFor, todayInHousehold } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { resolvePolicy } from "@/lib/policy";
import {
  describeCadence,
  evaluatePeriod,
  excusedDates,
  listResponsibilities,
  occurrenceDates,
} from "@/lib/responsibilities";
import { db } from "@/db";
import { completion } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { AddResponsibilityForm, ExcusalForm, RaiseForm } from "./forms";
import { CompletionGrid } from "./completion-grid";

export const dynamic = "force-dynamic";

export default async function ResponsibilitiesPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  if (!getChild(parent.householdId, childId)) notFound();

  const today = todayInHousehold();
  const policy = resolvePolicy(parent.householdId, childId, today);
  const period = payPeriodFor(today, {
    cadence: policy.pay.cadence,
    periodStartDay: policy.pay.periodStartDay,
    payDateOffsetDays: policy.pay.payDateOffsetDays,
  });

  const responsibilities = listResponsibilities(childId);
  const days = eachDate(period.startDate, period.endDate);

  const completions = db
    .select()
    .from(completion)
    .where(
      and(
        eq(completion.childId, childId),
        gte(completion.occurrenceDate, period.startDate),
        lte(completion.occurrenceDate, period.endDate),
      ),
    )
    .all();

  const rows = responsibilities.map((r) => {
    const result = evaluatePeriod(
      r,
      childId,
      period.startDate,
      period.endDate,
      policy.completion.mode,
    );
    const eligible = new Set(occurrenceDates(r, period.startDate, period.endDate));
    const excused = excusedDates(childId, r.id, period.startDate, period.endDate);

    return {
      id: r.id,
      name: r.name,
      cadence: r.cadence,
      cadenceLabel: describeCadence(r),
      weeklyValueCents: r.weeklyValueCents,
      potentialCents: result.potentialCents,
      earnedCents: result.earnedCents,
      completed: result.completed,
      chances: result.chances,
      eligibleDates: days.filter((d) => eligible.has(d)),
      excusedDates: days.filter((d) => excused.has(d)),
      doneDates: completions
        .filter((c) => c.responsibilityId === r.id)
        .map((c) => c.occurrenceDate),
    };
  });

  const totalPotential = rows.reduce((s, r) => s + r.potentialCents, 0);
  const totalEarned = rows.reduce((s, r) => s + r.earnedCents, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="text-lg font-semibold">This pay period</h2>
              <p className="text-xs text-ink-400">
                {period.startDate} to {period.endDate} · paid {period.payDate}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum text-lg">
                {formatCents(totalEarned)}{" "}
                <span className="text-sm text-ink-400">
                  of {formatCents(totalPotential)}
                </span>
              </p>
              <p className="text-xs text-ink-400">earned so far</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <Alert tone="info">
              No responsibilities yet. Add the first one on the right.
            </Alert>
          ) : (
            <CompletionGrid childId={childId} days={days} rows={rows} today={today} />
          )}
        </Card>

        {rows.length > 0 && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Still available to earn</h2>
            <p className="mb-4 text-xs text-ink-400">
              Money on the table, not a list of failures — the same data, framed the
              way it should be shown to a child.
            </p>
            <ul className="space-y-2 text-sm">
              {rows
                .filter((r) => r.earnedCents < r.potentialCents)
                .map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.name}</span>
                    <span className="tnum text-ledger-600 dark:text-ledger-500">
                      {formatCents(r.potentialCents - r.earnedCents)} left
                    </span>
                  </li>
                ))}
              {rows.every((r) => r.earnedCents >= r.potentialCents) && (
                <li className="text-ink-400">Everything earned. Nothing left on the table.</li>
              )}
            </ul>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <AddResponsibilityForm childId={childId} />
        <RaiseForm
          childId={childId}
          responsibilities={rows.map((r) => ({ id: r.id, name: r.name }))}
        />
        <ExcusalForm childId={childId} />
      </div>
    </div>
  );
}
