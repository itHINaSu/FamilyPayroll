import Link from "next/link";

import { Alert, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { formatCents } from "@/lib/money";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { listResponsibilities } from "@/lib/responsibilities";

export const dynamic = "force-dynamic";

/**
 * The setup-hub entry point for responsibilities.
 *
 * The paid work itself is still edited per child — a weekly ceiling only means
 * something in the context of one child's pay — so this is an index rather
 * than a form: one card per child, showing what is already set up, linking
 * into the same editor the child's own page uses.
 */
export default async function ResponsibilitiesHubPage() {
  const parent = await requireParent();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const children = listChildren(parent.householdId, { order: policy.display.childOrder });

  return (
    <>
      <PageHeader
        title="Responsibilities"
        subtitle="The paid work — a fixed weekly ceiling per child, set once and adjusted as they grow."
      />

      {children.length === 0 ? (
        <Alert tone="info">
          No children yet.{" "}
          <Link href="/children" className="font-medium underline">
            Add one
          </Link>{" "}
          to start assigning responsibilities.
        </Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((c) => {
            const list = listResponsibilities(c.id);
            const weeklyTotal = list.reduce((sum, r) => sum + r.weeklyValueCents, 0);

            return (
              <Link key={c.id} href={`/children/${c.id}/responsibilities`} className="block">
                <Card className="h-full transition hover:border-ledger-500">
                  <h2 className="font-semibold">{c.displayName}</h2>
                  <p className="mt-1 text-sm text-ink-400">
                    {list.length === 0
                      ? "Nothing set up yet"
                      : `${list.length} responsibilit${list.length === 1 ? "y" : "ies"} · up to ${formatCents(weeklyTotal)}/week`}
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
