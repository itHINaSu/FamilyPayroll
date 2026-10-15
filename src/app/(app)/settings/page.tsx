import Link from "next/link";

import { Card, PageHeader } from "@/components/ui";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { pendingJobClaims } from "@/lib/jobs";
import { ChevronRightIcon } from "../icons";

export const dynamic = "force-dynamic";

type Row = { href: string; title: string; detail: string };

/** Settings, grouped. Each row opens its own page. */
export default async function SettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();
  const waiting = pendingJobClaims(parent.householdId).length;

  const groups: { label: string; rows: Row[] }[] = [
    {
      label: "You",
      rows: [{ href: "/settings/account", title: "Account", detail: "Name, username, password, two-step sign-in" }],
    },
    {
      label: "Family",
      rows: [
        {
          href: "/settings/family",
          title: "Household",
          detail: "Family details, children, parents and their logins",
        },
      ],
    },
    {
      label: "Pay",
      rows: [
        {
          href: "/settings/payroll",
          title: "Payroll",
          detail: home?.payrollPausedOn
            ? "Paused — pay schedule, where pay goes, interest"
            : "Pay schedule, where pay goes, interest",
        },
        {
          href: "/settings/expectations",
          title: "Expectations",
          detail: "What each child is expected to do, and what it pays",
        },
        {
          href: "/settings/jobs",
          title: "Extra jobs",
          detail: waiting > 0 ? `${waiting} waiting for approval` : "Optional paid work kids can claim",
        },
        { href: "/settings/bills", title: "Bills", detail: "Rent and other recurring charges" },
      ],
    },
    {
      label: "App",
      rows: [
        { href: "/settings/display", title: "Display and kiosk", detail: "Who shows where, wall displays" },
        { href: "/settings/notifications", title: "Notifications", detail: "This device, what to send" },
      ],
    },
    {
      label: "Data",
      rows: [{ href: "/settings/data", title: "Backups and data", detail: "Snapshots, restore, reset history" }],
    },
  ];

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-2xl space-y-5">
        {groups.map((g) => (
          <section key={g.label}>
            <h2 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-ink-400">
              {g.label}
            </h2>
            <Card className="!p-0">
              <ul className="divide-y divide-ink-100 dark:divide-ink-700">
                {g.rows.map((r) => (
                  <li key={r.href}>
                    <Link
                      href={r.href}
                      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-ink-50 dark:hover:bg-ink-900"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{r.title}</span>
                        <span className="block text-xs text-ink-400">{r.detail}</span>
                      </span>
                      <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-ink-300 dark:text-ink-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
