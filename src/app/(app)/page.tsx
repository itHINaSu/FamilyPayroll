import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { getHousehold, requireUser } from "@/lib/auth/guard";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { attentionItems, householdWeek } from "@/lib/today";
import { KidSummary } from "./kid-summary";

export const dynamic = "force-dynamic";

/**
 * Everyone at a glance, read-only: each child's pay period on the left and
 * their money on the right. A tap on either half goes to that child on the
 * Expectations or Balances tab, which is where changes are made.
 */
export default async function DashboardPage() {
  const sessionUser = await requireUser();
  const home = getHousehold();
  const { today, children } = householdWeek(sessionUser.householdId);
  const attention = attentionItems(sessionUser.householdId);

  // Only what needs a parent, one line each.
  const notices: { key: string; href: string; text: React.ReactNode }[] = [];
  if (home?.payrollPausedOn) {
    notices.push({
      key: "paused",
      href: "/settings/payroll",
      text: <>Payroll is paused (since {formatShortDate(home.payrollPausedOn)})</>,
    });
  }
  for (const c of children.filter((x) => x.shortfall)) {
    notices.push({
      key: `short-${c.id}`,
      href: `/balances/${c.id}`,
      text: (
        <>
          {c.name} is {formatCents(c.shortfall!.shortCents)} short for {c.shortfall!.billName}{" "}
          ({formatShortDate(c.shortfall!.dueDate)})
        </>
      ),
    });
  }
  if (attention.pendingJobs > 0) {
    notices.push({
      key: "jobs",
      href: "/jobs",
      text: (
        <>
          {attention.pendingJobs} job{attention.pendingJobs === 1 ? "" : "s"} waiting for approval
        </>
      ),
    });
  }

  return (
    <>
      <PageHeader title="Dashboard" />

      <div className="space-y-3">
        {notices.length > 0 && (
          <ul className="divide-y divide-amber-200 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900 dark:divide-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {notices.map((n) => (
              <li key={n.key}>
                <Link href={n.href} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">{n.text}</span>
                  <span aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
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
          <div className="grid gap-2.5 lg:grid-cols-2">
            {children.map((c) => (
              <KidSummary key={c.id} child={c} today={today} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
