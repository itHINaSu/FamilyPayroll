import { notFound } from "next/navigation";

import { Card } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { formatDateRange, formatShortDate, todayInHousehold } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { childWeek } from "@/lib/today";
import { PeriodTotal, WeekCard } from "../../../expectations/week-card";
import { ExcusalForm } from "./forms";
import { MissList } from "./miss-list";

export const dynamic = "force-dynamic";

/**
 * One child's expectations, expanded: every week of the pay period, every
 * miss with its note, and excused days. Adding or changing expectations is
 * Setup › Expectations.
 */
export default async function ChildExpectationsPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  const week = childWeek(parent.householdId, childId);
  if (!week) notFound();

  const today = todayInHousehold();
  const misses = week.expectations
    .flatMap((e) => e.misses.map((m) => ({ ...m, name: e.name })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const earnable = week.expectations.filter((e) => e.payMode === "optional");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">This pay period</h2>
              <p className="text-xs text-ink-400">
                {formatDateRange(week.period.startDate, week.period.endDate)} · paid{" "}
                {formatShortDate(week.period.payDate)}
              </p>
            </div>
            <PeriodTotal child={week} />
          </div>
        </Card>

        <WeekCard child={week} today={today} full />
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Misses this period</h2>
          <p className="mb-2 text-xs text-ink-400">
            Notes go on the paycheck. To undo a miss, tap its box again.
          </p>
          {misses.length === 0 ? (
            <p className="text-sm text-ink-400">None — everything met so far.</p>
          ) : (
            <MissList childId={childId} misses={misses} />
          )}
        </Card>

        {earnable.length > 0 && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Still available to earn</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {earnable.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>{e.name}</span>
                  <span className="tnum whitespace-nowrap text-ledger-600 dark:text-ledger-500">
                    {e.toEarnCents > 0 ? `${formatCents(e.toEarnCents)} left` : "Earned"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <ExcusalForm childId={childId} />
      </div>
    </div>
  );
}
