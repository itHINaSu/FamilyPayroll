import Link from "next/link";
import { notFound } from "next/navigation";

import { BackChevron, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { formatDateRange, formatShortDate, todayInHousehold } from "@/lib/dates";
import { childWeek } from "@/lib/today";
import { PeriodTotal, WeekCard } from "../week-card";
import { MissList } from "./miss-list";

export const dynamic = "force-dynamic";

/**
 * One child's expectations, expanded: every week of the pay period and
 * every miss with its note. Adding or changing expectations is
 * Settings › Expectations.
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

  return (
    <>
    <PageHeader
      title={week.name}
      back={
        <Link href={`/expectations#child-${childId}`} title="Expectations">
          <BackChevron label="Expectations" />
        </Link>
      }
    />
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
      </div>
    </div>
    </>
  );
}
