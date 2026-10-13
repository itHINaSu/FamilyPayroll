import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { upcomingBills } from "@/lib/bills";
import { listChildren } from "@/lib/children";
import { getBalances } from "@/lib/ledger";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { BalanceCard, type BalanceView } from "./balance-card";

export const dynamic = "force-dynamic";

/** Every child's money, as cards. Tap a name for the full history. */
export default async function BalancesPage() {
  const parent = await requireParent();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const children = listChildren(parent.householdId, { order: policy.display.childOrder });

  const views: BalanceView[] = children.map((c) => {
    const b = getBalances(c.id);
    const bills = upcomingBills(c.id, 30);
    const next = bills[0];
    return {
      id: c.id,
      name: c.displayName,
      photoBlobId: c.photoBlobId,
      checkingCents: b.checking,
      savingsCents: b.savings,
      generosityCents: b.generosity,
      totalCents: b.visibleTotal,
      billsDueCents: bills.reduce((n, x) => n + x.outstandingCents, 0),
      nextBill: next
        ? { name: next.billName, dueDate: next.dueDate, shortCents: next.shortfallCents }
        : null,
    };
  });

  return (
    <>
      <PageHeader title="Balances" />
      {views.length === 0 ? (
        <Alert tone="info">
          No children yet —{" "}
          <Link href="/children" className="font-medium underline">
            add one under Setup › Children
          </Link>
          .
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {views.map((v) => (
            <BalanceCard key={v.id} child={v} />
          ))}
        </div>
      )}
    </>
  );
}
