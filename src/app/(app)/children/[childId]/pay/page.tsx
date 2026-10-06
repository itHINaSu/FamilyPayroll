import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { Alert, Card } from "@/components/ui";
import { db } from "@/db";
import { payPeriod, paystub, paystubLine } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { formatDateRange, formatShortDate, payPeriodFor, todayInHousehold } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { computeDraft } from "@/lib/payroll";
import { resolvePolicy } from "@/lib/policy";
import { PayrollControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  if (!getChild(parent.householdId, childId)) notFound();

  const today = todayInHousehold();
  const policy = resolvePolicy(parent.householdId, childId, today);
  const current = payPeriodFor(today, {
    cadence: policy.pay.cadence,
    periodStartDay: policy.pay.periodStartDay,
    payDateOffsetDays: policy.pay.payDateOffsetDays,
  });

  // The in-flight period: earned but not yet paid, exactly as a real job works.
  const pending = computeDraft(
    parent.householdId,
    childId,
    current.startDate,
    current.endDate,
  );

  const stubs = db
    .select({ stub: paystub, period: payPeriod })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .where(eq(paystub.childId, childId))
    .orderBy(desc(payPeriod.startDate))
    .limit(20)
    .all();

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">This period</h2>
            <p className="text-xs text-ink-400">
              {formatDateRange(current.startDate, current.endDate)}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum text-2xl">{formatCents(pending.earnedCents)}</p>
            <p className="text-xs text-ink-400">
              earned so far · payday {formatShortDate(current.payDate)}
            </p>
          </div>
        </div>

        <Alert tone="info">
          A pending paycheck does not count toward a bill due before payday. That
          gap is deliberate — it is where planning ahead gets learned.
        </Alert>

        <div className="mt-4">
          <PayrollControls
            childId={childId}
            startDate={current.startDate}
            endDate={current.endDate}
            payDate={current.payDate}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Pay stubs</h2>

        {stubs.length === 0 ? (
          <Alert tone="info">
            No pay stubs yet. One is drafted automatically when the period closes
            and posts itself on payday — you do not have to do anything.
          </Alert>
        ) : (
          <div className="space-y-4">
            {stubs.map(({ stub, period }) => {
              const lines = db
                .select()
                .from(paystubLine)
                .where(eq(paystubLine.paystubId, stub.id))
                .orderBy(paystubLine.sortOrder)
                .all();

              const allocations = stub.allocationsJson as Record<string, number>;

              return (
                <div
                  key={stub.id}
                  className="rounded-lg border border-ink-200 p-4 dark:border-ink-700"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {formatDateRange(period.startDate, period.endDate)}
                      </p>
                      <p className="text-xs text-ink-400">
                        {stub.status === "posted"
                          ? `Paid ${formatShortDate(period.payDate)}`
                          : `Draft · posts ${formatShortDate(period.payDate)}`}
                        {stub.revisionCount > 0 && ` · revised ${stub.revisionCount}×`}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        stub.status === "posted"
                          ? "bg-ledger-100 text-ledger-600"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {stub.status === "posted" ? "Posted" : "Draft"}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-1 text-ink-500 dark:text-ink-300">
                            {line.label}
                            {line.kind === "job" && (
                              <span className="ml-1.5 text-xs text-ink-400">bonus</span>
                            )}
                          </td>
                          <td className="tnum py-1 text-right text-ink-400">
                            {line.potentialCents > 0
                              ? formatCents(line.potentialCents)
                              : ""}
                          </td>
                          <td className="tnum py-1 text-right">
                            {formatCents(line.earnedCents)}
                          </td>
                        </tr>
                      ))}

                      <tr className="border-t border-ink-200 dark:border-ink-700">
                        <td className="pt-2 font-medium">Potential pay</td>
                        <td />
                        <td className="tnum pt-2 text-right text-ink-400">
                          {formatCents(stub.potentialCents)}
                        </td>
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
                          <td className="tnum text-right">
                            −{formatCents(stub.pastDueRecoveredCents)}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-ink-200 dark:border-ink-700">
                        <td className="pt-2 font-semibold">Net deposit</td>
                        <td />
                        <td className="tnum pt-2 text-right font-semibold">
                          {formatCents(stub.netCents)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  </div>

                  <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-700">
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                      Allocation
                    </p>
                    <dl className="space-y-1 text-sm">
                      {Object.entries(allocations).map(([bucket, amount]) => (
                        <div key={bucket} className="flex justify-between">
                          <dt className="capitalize text-ink-500 dark:text-ink-300">
                            {bucket}
                          </dt>
                          <dd className="tnum">{formatCents(amount)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
