import Link from "next/link";

import { Alert, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { listBills } from "@/lib/bills";
import { listChildren } from "@/lib/children";
import { formatCents } from "@/lib/money";
import { resolveHouseholdPolicy } from "@/lib/policy";

export const dynamic = "force-dynamic";

/**
 * The setup-hub entry point for bills.
 *
 * Rent is the classic one: a fixed amount due whether or not a paycheck was
 * earned. Like responsibilities, a bill only means something against one
 * child's balance, so this stays an index into each child's own bills page
 * rather than a form of its own.
 */
export default async function BillsHubPage() {
  const parent = await requireParent();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const children = listChildren(parent.householdId, { order: policy.display.childOrder });

  return (
    <>
      <PageHeader
        title="Bills"
        subtitle="Rent, subscriptions, anything due whether or not a paycheck was earned."
      />

      {children.length === 0 ? (
        <Alert tone="info">
          No children yet.{" "}
          <Link href="/children" className="font-medium underline">
            Add one
          </Link>{" "}
          to start setting up bills.
        </Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((c) => {
            const bills = listBills(c.id);
            const monthlyTotal = bills
              .filter((b) => b.cadence === "monthly")
              .reduce((sum, b) => sum + b.amountCents, 0);

            return (
              <Link key={c.id} href={`/children/${c.id}/bills`} className="block">
                <Card className="h-full transition hover:border-ledger-500">
                  <h2 className="font-semibold">{c.displayName}</h2>
                  <p className="mt-1 text-sm text-ink-400">
                    {bills.length === 0
                      ? "No bills yet"
                      : `${bills.length} bill${bills.length === 1 ? "" : "s"}${
                          monthlyTotal > 0 ? ` · ${formatCents(monthlyTotal)}/month` : ""
                        }`}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
