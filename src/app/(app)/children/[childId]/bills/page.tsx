import { notFound } from "next/navigation";

import { Alert, Card } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { DISPOSITION_LABELS, listBillTemplates, listBills, upcomingBills } from "@/lib/bills";
import { getChild } from "@/lib/children";
import { getBalances } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { addTemplateForThisChild, archiveBill } from "./actions";
import { AddBillForm, CollectButton, EditableBillRow } from "./forms";

export const dynamic = "force-dynamic";

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

  const enabledTemplateIds = new Set(bills.filter((b) => b.templateId).map((b) => b.templateId));
  const availableTemplates = listBillTemplates(parent.householdId).filter(
    (t) => !enabledTemplateIds.has(t.id),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {short.length > 0 && (
          <Alert tone="warning">
            <strong>Heads up.</strong>{" "}
            {short.map((b) => (
              <span key={b.instanceId} className="block">
                {b.billName} is due {b.dueDate}. {record.displayName} has{" "}
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
                    <td className="tnum py-2.5 text-ink-400">{b.dueDate}</td>
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
            <ul className="space-y-3">
              {bills.map((b) => (
                <EditableBillRow
                  key={b.id}
                  bill={{
                    id: b.id,
                    name: b.name,
                    amountCents: b.amountCents,
                    cadence: b.cadence,
                    dueDay: b.dueDay,
                    disposition: b.disposition,
                    sourceAccountOrder: b.sourceAccountOrder as string[],
                  }}
                  childId={childId}
                  fromTemplate={!!b.templateId}
                  customized={!!b.templateId && !b.syncedWithTemplate}
                  dispositionLabel={DISPOSITION_LABELS[b.disposition]}
                  onArchive={
                    <form action={archiveBill}>
                      <input type="hidden" name="billId" value={b.id} />
                      <input type="hidden" name="childId" value={childId} />
                      <button
                        type="submit"
                        className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                      >
                        {b.templateId ? "Turn off" : "Archive"}
                      </button>
                    </form>
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        {availableTemplates.length > 0 && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Family bills not included</h2>
            <p className="mb-4 text-xs text-ink-400">
              Turned off for {record.displayName}. Add one back at the family
              rate, then customize it here if needed.
            </p>
            <ul className="space-y-2 text-sm">
              {availableTemplates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <span>
                    {t.name}
                    <span className="ml-2 text-xs text-ink-400">
                      {formatCents(t.amountCents)}
                    </span>
                  </span>
                  <form action={addTemplateForThisChild}>
                    <input type="hidden" name="childId" value={childId} />
                    <input type="hidden" name="templateId" value={t.id} />
                    <button type="submit" className="text-xs text-ledger-600 hover:underline">
                      Add for {record.displayName}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <AddBillForm childId={childId} />
    </div>
  );
}
