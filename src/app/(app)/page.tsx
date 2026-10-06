import Link from "next/link";

import { Alert, Card, PageHeader } from "@/components/ui";
import { getHousehold, requireUser } from "@/lib/auth/guard";
import { formatCents } from "@/lib/money";
import { attentionItems, todayForHousehold } from "@/lib/today";
import { TodayCard } from "./today-card";

export const dynamic = "force-dynamic";

/**
 * The daily view.
 *
 * This is the screen a parent opens on a weeknight, so it leads with the thing
 * they are here to do — tick off what got done — rather than with balances,
 * which are something you check occasionally. Money lives one click away under
 * each child.
 */
export default async function DashboardPage() {
  const sessionUser = await requireUser();
  const home = getHousehold();
  const { today, children } = todayForHousehold(sessionUser.householdId);
  const attention = attentionItems(sessionUser.householdId);

  const friendlyDate = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const shortfalls = children.filter((c) => c.shortfall);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={home?.name ? `${friendlyDate} · ${home.name}` : friendlyDate}
        action={
          <Link
            href="/balances"
            className="text-sm text-ink-400 transition hover:underline"
          >
            Balances and history →
          </Link>
        }
      />

      {home?.payrollPausedOn && (
        <div className="mb-6">
          <Alert tone="warning">
            <strong>Payroll is paused</strong> (since {home.payrollPausedOn}) — nothing is
            paid or billed.{" "}
            <Link href="/settings#payroll" className="font-medium underline">
              Start payroll
            </Link>
          </Alert>
        </div>
      )}

      {children.length === 0 ? (
        <Alert tone="info">
          Nobody is earning yet.{" "}
          <Link href="/children" className="font-medium underline">
            Add a child
          </Link>{" "}
          to get started — you can add responsibilities from their page, or use an
          age preset to fill them in.
        </Alert>
      ) : (
        <div className="space-y-6">
          {shortfalls.map((c) => (
            <Alert key={c.id} tone="warning">
              <strong>{c.name} will be short.</strong>{" "}
              {c.shortfall!.billName} is due {c.shortfall!.dueDate} and they are{" "}
              {formatCents(c.shortfall!.shortCents)} short. A pending paycheck does
              not count toward it — that gap is the planning lesson.
            </Alert>
          ))}

          {attention.pendingJobs > 0 && (
            <Alert tone="info">
              {attention.pendingJobs} job
              {attention.pendingJobs === 1 ? " is" : "s are"} waiting for your
              approval.{" "}
              <Link href="/jobs" className="font-medium underline">
                Review
              </Link>
            </Alert>
          )}

          {attention.draftPaystubs > 0 && attention.nextPayDate && (
            <Alert tone="info">
              {attention.draftPaystubs} pay stub
              {attention.draftPaystubs === 1 ? "" : "s"} drafted. They post on their
              own — you only need to look if something needs changing.
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {children.map((c) => (
              <TodayCard key={c.id} child={c} today={today} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
