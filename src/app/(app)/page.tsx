import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { getHousehold, requireUser } from "@/lib/auth/guard";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { attentionItems, householdWeek } from "@/lib/today";
import { TodayCard } from "./today-card";

export const dynamic = "force-dynamic";

/**
 * The daily view: each child's pay this week and today's boxes to tap.
 * The whole week is on the Expectations tab; money is on Balances.
 */
export default async function DashboardPage() {
  const sessionUser = await requireUser();
  const home = getHousehold();
  const { today, children } = householdWeek(sessionUser.householdId);
  const attention = attentionItems(sessionUser.householdId);
  const shortfalls = children.filter((c) => c.shortfall);

  return (
    <>
      <PageHeader title="Dashboard" />

      <div className="space-y-4">
        {home?.payrollPausedOn && (
          <Alert tone="warning">
            <strong>Payroll is paused</strong> (since {formatShortDate(home.payrollPausedOn)}) —
            nothing is paid or billed.{" "}
            <Link href="/settings/payroll" className="font-medium underline">
              Start payroll
            </Link>
          </Alert>
        )}

        {shortfalls.map((c) => (
          <Alert key={c.id} tone="warning">
            <strong>{c.name} will be short.</strong> {c.shortfall!.billName} is due{" "}
            {formatShortDate(c.shortfall!.dueDate)} and they are{" "}
            {formatCents(c.shortfall!.shortCents)} short.
          </Alert>
        ))}

        {attention.pendingJobs > 0 && (
          <Alert tone="info">
            {attention.pendingJobs} job{attention.pendingJobs === 1 ? " is" : "s are"} waiting
            for your approval.{" "}
            <Link href="/jobs" className="font-medium underline">
              Review
            </Link>
          </Alert>
        )}

        {children.length === 0 ? (
          <Alert tone="info">
            Nobody is earning yet.{" "}
            <Link href="/children" className="font-medium underline">
              Add a child
            </Link>{" "}
            under Setup › Children to get started.
          </Alert>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {children.map((c) => (
              <TodayCard key={c.id} child={c} today={today} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
