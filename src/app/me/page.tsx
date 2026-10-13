import { redirect } from "next/navigation";

import { Alert, Card } from "@/components/ui";
import { getHousehold, requireUser } from "@/lib/auth/guard";
import { kioskChildDetail } from "@/lib/kiosk";
import { formatCents } from "@/lib/money";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

/**
 * A child's own personal view — not the parent app, and not the shared
 * kiosk. This is the one route a role='child' session is allowed to reach;
 * the (app) layout redirects any child-role session here before it ever
 * touches a parent page, so nothing in this file is the safety boundary —
 * kioskChildDetail (invariants I4 and I11) already is.
 */
export default async function MePage() {
  const sessionUser = await requireUser();
  if (sessionUser.role !== "child" || !sessionUser.childId) redirect("/");

  const home = getHousehold();
  const detail = kioskChildDetail(sessionUser.householdId, sessionUser.childId);

  if (!detail) {
    return (
      <main className="mx-auto max-w-lg px-6 py-12">
        <Alert>Your account isn&apos;t linked to an active child record.</Alert>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi, {detail.name}</h1>
          <p className="text-sm text-ink-400">{home?.name}</p>
        </div>
        <SignOutButton />
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Total</p>
        <p className="tnum mt-1 text-3xl">{formatCents(detail.total)}</p>
        {detail.pendingCents > 0 && (
          <p className="mt-1 text-xs text-ink-400">
            {formatCents(detail.pendingCents)} earned, not paid yet
          </p>
        )}
      </Card>

      {detail.responsibilities.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Still available to earn</h2>
          <ul className="space-y-2 text-sm">
            {detail.responsibilities
              .filter((r) => r.remainingCents > 0)
              .map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.name}</span>
                  <span className="tnum text-ledger-600 dark:text-ledger-500">
                    {formatCents(r.remainingCents)} left
                  </span>
                </li>
              ))}
            {detail.responsibilities.every((r) => r.remainingCents === 0) && (
              <li className="text-ink-400">Everything earned. Nothing left on the table.</li>
            )}
          </ul>
        </Card>
      )}

      {detail.goals.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Goals</h2>
          <ul className="space-y-2 text-sm">
            {detail.goals.map((g) => (
              <li key={g.name} className="flex justify-between">
                <span>{g.name}</span>
                <span className="tnum text-ink-400">{Math.round(g.progressPct)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
