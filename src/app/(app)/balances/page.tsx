import Link from "next/link";

import { JumpRow } from "@/components/jump-row";
import { Alert, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { upcomingBills } from "@/lib/bills";
import { listChildren } from "@/lib/children";
import { getBalances } from "@/lib/ledger";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { AddMoneyButton } from "./add-money";
import { BalanceCard, type BalanceView } from "./balance-card";
import { moneyKid } from "./data";

export const dynamic = "force-dynamic";

/**
 * Every child's money, as cards — the "at the store" tab. Tap a name for
 * that child's account; "+" or a card's button records a transaction.
 */
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
  const kids = children.map((c) => moneyKid(parent.householdId, c));

  return (
    <>
      <PageHeader title="Balances" action={<AddMoneyButton kids={kids} />}>
        <JumpRow
          kids={children.map((c) => ({ id: c.id, name: c.displayName, photoBlobId: c.photoBlobId }))}
        />
      </PageHeader>
      {views.length === 0 ? (
        <Alert tone="info">
          No children yet —{" "}
          <Link href="/settings/family" className="font-medium underline">
            add one in Settings › Household
          </Link>
          .
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {views.map((v, i) => (
            <BalanceCard key={v.id} child={v} kid={kids[i]} />
          ))}
        </div>
      )}
    </>
  );
}
