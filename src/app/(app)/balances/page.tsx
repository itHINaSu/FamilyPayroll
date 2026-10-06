import { PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { getBalances } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { ChildPicker } from "../child-picker";

export const dynamic = "force-dynamic";

/**
 * The money side of children: pick one, land on their accounts and history.
 * Adding and archiving children is Setup › Children (/children), not here.
 */
export default async function BalancesPage() {
  const parent = await requireParent();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const children = listChildren(parent.householdId, { order: policy.display.childOrder });

  return (
    <>
      <PageHeader title="Balances" />
      <ChildPicker
        children={children}
        hrefFor={(id) => `/children/${id}`}
        subtitleFor={(id) => `${formatCents(getBalances(id).visibleTotal)} total`}
        emptyMessage="No children yet — add one under Setup › Children."
      />
    </>
  );
}
