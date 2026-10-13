import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { BackChevron, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { payPeriod, paystub, paystubLine } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { formatDateRange, formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

/** One paycheck: each expectation, what was missed and why, and where the money went. */
export default async function PayStubPage({
  params,
}: {
  params: Promise<{ childId: string; stubId: string }>;
}) {
  const { childId, stubId } = await params;
  const parent = await requireParent();
  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const found = db
    .select({ stub: paystub, period: payPeriod })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .where(and(eq(paystub.id, stubId), eq(paystub.childId, childId)))
    .get();
  if (!found) notFound();
  const { stub, period } = found;

  const lines = db
    .select()
    .from(paystubLine)
    .where(eq(paystubLine.paystubId, stub.id))
    .orderBy(paystubLine.sortOrder)
    .all();
  const allocations = stub.allocationsJson as Record<string, number>;

  return (
    <>
      <PageHeader
        title="Pay stub"
        back={
          <Link href={`/balances/${childId}`} title={record.displayName}>
            <BackChevron label={record.displayName} />
          </Link>
        }
      />

      <div className="mx-auto max-w-2xl">
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{record.displayName}</p>
              <p className="text-xs text-ink-400">
                {formatDateRange(period.startDate, period.endDate)} ·{" "}
                {stub.status === "posted"
                  ? `paid ${formatShortDate(period.payDate)}`
                  : `draft · posts ${formatShortDate(period.payDate)}`}
                {stub.revisionCount > 0 && ` · revised ${stub.revisionCount}×`}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                stub.status === "posted"
                  ? "bg-ledger-100 text-ledger-600"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              }`}
            >
              {stub.status === "posted" ? "Posted" : "Draft"}
            </span>
          </div>

          <table className="w-full text-sm">
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="py-1.5 pr-2 text-ink-500 dark:text-ink-300">
                    {line.label}
                    {line.kind === "job" && <span className="ml-1.5 text-xs text-ink-400">bonus</span>}
                    {missedNote(line.detailJson)}
                  </td>
                  <td className="tnum py-1.5 pr-2 text-right text-ink-400">
                    {line.potentialCents > 0 ? formatCents(line.potentialCents) : ""}
                  </td>
                  <td className="tnum py-1.5 text-right">{formatCents(line.earnedCents)}</td>
                </tr>
              ))}

              <tr className="border-t border-ink-200 dark:border-ink-700">
                <td className="pt-2 font-medium">Potential pay</td>
                <td />
                <td className="tnum pt-2 text-right text-ink-400">{formatCents(stub.potentialCents)}</td>
              </tr>
              <tr>
                <td className="font-medium">Earned pay</td>
                <td />
                <td className="tnum text-right">{formatCents(stub.earnedCents)}</td>
              </tr>
              {stub.bonusCents > 0 && (
                <tr>
                  <td className="font-medium">Bonus pay</td>
                  <td />
                  <td className="tnum text-right">{formatCents(stub.bonusCents)}</td>
                </tr>
              )}
              {stub.pastDueRecoveredCents > 0 && (
                <tr>
                  <td className="font-medium">Past due recovered</td>
                  <td />
                  <td className="tnum text-right">−{formatCents(stub.pastDueRecoveredCents)}</td>
                </tr>
              )}
              <tr className="border-t border-ink-200 dark:border-ink-700">
                <td className="pt-2 font-semibold">Net deposit</td>
                <td />
                <td className="tnum pt-2 text-right font-semibold">{formatCents(stub.netCents)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 border-t border-ink-100 pt-3 dark:border-ink-700">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
              Where it went
            </p>
            <dl className="space-y-1 text-sm">
              {Object.entries(allocations).map(([bucket, amount]) => (
                <div key={bucket} className="flex justify-between">
                  <dt className="capitalize text-ink-500 dark:text-ink-300">{bucket}</dt>
                  <dd className="tnum">{formatCents(amount)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Under a docked line: how many were missed, and each miss's note. */
function missedNote(detail: unknown) {
  const d = (detail ?? {}) as {
    missed?: number;
    allOrNothing?: boolean;
    misses?: { date: string; note: string | null }[];
  };
  if (!d.missed) return null;
  return (
    <span className="block text-xs text-ink-400">
      {d.missed} missed{d.allOrNothing ? " · all or nothing" : ""}
      {(d.misses ?? [])
        .filter((m) => m.note)
        .map((m) => (
          <span key={m.date + m.note} className="block italic">
            {formatShortDate(m.date)}: {m.note}
          </span>
        ))}
    </span>
  );
}
