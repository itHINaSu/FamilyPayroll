import Link from "next/link";

import { JumpRow } from "@/components/jump-row";
import { Alert, PageHeader } from "@/components/ui";
import { getHousehold, requireUser } from "@/lib/auth/guard";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { attentionItems, householdWeek } from "@/lib/today";
import { FillCards } from "./fill-cards";
import { KidSummary } from "./kid-summary";

export const dynamic = "force-dynamic";

/**
 * Everyone at a glance, read-only: each child's week and their checking
 * balance. A tap goes to that child on the Expectations or Balances tab,
 * which is where changes are made.
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
      href: "/settings/jobs",
      text: (
        <>
          {attention.pendingJobs} job{attention.pendingJobs === 1 ? "" : "s"} waiting for approval
        </>
      ),
    });
  }

  return (
    <>
      <PageHeader title="Dashboard">
        <JumpRow
          kids={children.map((c) => ({ id: c.id, name: c.name, photoBlobId: c.photoBlobId }))}
        />
      </PageHeader>

      <div className="space-y-3">
        {notices.length > 0 && (
          <ul className="divide-y divide-amber-200 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900 dark:divide-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {notices.map((n) => (
              <li key={n.key}>
                <Link href={n.href} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
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
            <Link href="/settings/family" className="font-medium underline">
              Add a child
            </Link>{" "}
            in Settings › Household to get started.
          </Alert>
        ) : (
          <FillCards perScreen={2} className="grid gap-3 lg:grid-cols-2">
            {children.map((c) => (
              <KidSummary key={c.id} child={c} today={today} />
            ))}
          </FillCards>
        )}
      </div>
    </>
  );
}
