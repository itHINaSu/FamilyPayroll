import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, BackChevron, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { listGoals } from "@/lib/goals";
import { getBalances } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { AddGoalForm, GoalCard } from "./forms";

export const dynamic = "force-dynamic";

export default async function GoalsPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const goals = listGoals(childId, true);
  const balances = getBalances(childId);
  const active = goals.filter((g) => g.status === "active");
  const finished = goals.filter((g) => g.status !== "active");

  return (
    <>
    <PageHeader
      title={`${record.displayName}'s goals`}
      back={
        <Link href={`/balances/${childId}`} title={record.displayName}>
          <BackChevron label={record.displayName} />
        </Link>
      }
    />
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Savings</h2>
          <p className="mb-4 text-xs text-ink-400">
            Earmarking does not move money out of savings — it decides what the
            money is for. Both numbers stay visible.
          </p>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-ink-400">Savings total</dt>
              <dd className="tnum text-xl">{formatCents(balances.savings)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Unassigned</dt>
              <dd className="tnum text-xl">{formatCents(balances.savingsGeneral)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Toward goals</dt>
              <dd className="tnum text-xl">{formatCents(balances.savingsEarmarked)}</dd>
            </div>
          </dl>
        </Card>

        {active.length === 0 ? (
          <Alert tone="info">
            No goals yet. A named goal with a picture and a progress bar is the
            strongest motivator this app has for a young child.
          </Alert>
        ) : (
          <div className="space-y-4">
            {active.map((g) => (
              <GoalCard key={g.id} goal={g} childId={childId} />
            ))}
          </div>
        )}

        {finished.length > 0 && (
          <Card>
            <h2 className="mb-3 text-sm font-medium text-ink-400">Finished</h2>
            <ul className="space-y-2 text-sm">
              {finished.map((g) => (
                <li key={g.id} className="flex justify-between">
                  <span>{g.name}</span>
                  <span className="text-ink-400">
                    {g.status === "achieved" ? "Achieved" : "Cancelled"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <AddGoalForm childId={childId} />
    </div>
    </>
  );
}
