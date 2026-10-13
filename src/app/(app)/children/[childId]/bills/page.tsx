import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, Card } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { DISPOSITION_LABELS, listBills, upcomingBills } from "@/lib/bills";
import { getChild } from "@/lib/children";
import { getBalances } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { CollectButton } from "./forms";
import { formatShortDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function BillsPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const bills = listBills(childId);
  const upcoming = upcomingBills(childId, 45);
  const balances = getBalances(childId);

  const short = upcoming.filter((b) => b.shortfallCents > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="space-y-6">
        {short.length > 0 && (
          <Alert tone="warning">
            <strong>Heads up.</strong>{" "}
            {short.map((b) => (
              <span key={b.instanceId} className="block">
                {b.billName} is due {formatShortDate(b.dueDate)}. {record.displayName} has{" "}
                {formatCents(balances.checking)} and needs{" "}
                {formatCents(b.outstandingCents)} — short{" "}
                {formatCents(b.shortfallCents)}.
              </span>
            ))}
            <span className="mt-2 block text-xs">
              A pending paycheck does not count toward this. That is the planning
              lesson.
            </span>
          </Alert>
        )}

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Coming up</h2>
          {upcoming.length === 0 ? (
            <Alert tone="info">Nothing due in the next 45 days.</Alert>
          ) : (
            // Five columns is more than a phone can show at once without
            // truncating the bill name into nothing useful; scroll rather
            // than squeeze.
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-700">
                  <th className="pb-2 font-medium">Bill</th>
                  <th className="pb-2 font-medium">Due</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((b) => (
                  <tr
                    key={b.instanceId}
                    className="border-b border-ink-100 last:border-0 dark:border-ink-700"
                  >
                    <td className="py-2.5">{b.billName}</td>
                    <td className="tnum py-2.5 text-ink-400">{formatShortDate(b.dueDate)}</td>
                    <td className="tnum py-2.5 text-right">
                      {formatCents(b.outstandingCents)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          b.status === "past_due"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200"
                            : b.status === "partially_paid"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                              : "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-200"
                        }`}
                      >
                        {b.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <CollectButton instanceId={b.instanceId} childId={childId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Recurring bills</h2>
          {bills.length === 0 ? (
            <Alert tone="info">
              No bills yet. Rent is the classic one: a fixed amount due whether or
              not a paycheck was earned.
            </Alert>
          ) : (
            <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-700">
              {bills.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    {b.name}
                    <span className="block text-xs text-ink-400">
                      {b.cadence === "monthly" ? `Day ${b.dueDay} of the month` : `Every ${WEEKDAYS[b.dueDay]}`}{" "}
                      · {DISPOSITION_LABELS[b.disposition]} (parents only)
                    </span>
                  </span>
                  <span className="tnum shrink-0">{formatCents(b.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="text-center text-xs text-ink-400">
          Add, change, or turn off bills in{" "}
          <Link href="/bills" className="underline">
            Setup › Bills
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
