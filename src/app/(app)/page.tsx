import Link from "next/link";
import { inArray } from "drizzle-orm";

import { Alert, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getHousehold, requireUser } from "@/lib/auth/guard";
import { ageFromBirthdate, listChildren } from "@/lib/children";
import { getBalances, listRecentActivity, LEDGER_TYPE_LABELS } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { ACCOUNT_LABELS } from "@/lib/transaction-kinds";

export const dynamic = "force-dynamic";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function DashboardPage() {
  const sessionUser = await requireUser();
  const children = listChildren(sessionUser.householdId);
  const home = getHousehold();
  const activity = listRecentActivity(sessionUser.householdId, 12);

  const actorIds = [
    ...new Set(
      activity.map((a) => a.entry.actorUserId).filter((id): id is string => !!id),
    ),
  ];
  const actorNames = new Map(
    actorIds.length
      ? db
          .select({ id: user.id, displayName: user.displayName })
          .from(user)
          .where(inArray(user.id, actorIds))
          .all()
          .map((u) => [u.id, u.displayName] as const)
      : [],
  );

  return (
    <>
      <PageHeader
        title={home?.name ?? "Dashboard"}
        subtitle="Every dollar has a job."
        action={
          <Link
            href="/children"
            className="text-sm text-ink-400 transition hover:underline"
          >
            Manage children
          </Link>
        }
      />

      {children.length === 0 ? (
        <Alert tone="info">
          No children yet.{" "}
          <Link href="/children" className="font-medium underline">
            Add your first one
          </Link>{" "}
          to get started.
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="grid gap-4 sm:grid-cols-2">
            {children.map((c) => {
              // getBalances excludes `held` from visibleTotal (invariant I4),
              // which matters here because this view is shown on shared screens.
              const balances = getBalances(c.id);

              return (
                <Card key={c.id}>
                  <Link href={`/children/${c.id}`} className="block">
                    <div className="mb-4 flex items-center gap-3">
                      {c.photoBlobId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/blobs/${c.photoBlobId}`}
                          alt=""
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 font-semibold text-ink-400 dark:bg-ink-700">
                          {c.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{c.displayName}</p>
                        <p className="text-xs text-ink-400">
                          {ageFromBirthdate(c.birthdate)} years old
                        </p>
                      </div>
                    </div>

                    <dl className="space-y-1.5 text-sm">
                      <Row label="Checking" cents={balances.checking} />
                      <Row label="Savings" cents={balances.savings} />
                      <Row label="Generosity" cents={balances.generosity} />
                      <div className="flex justify-between border-t border-ink-100 pt-1.5 font-medium dark:border-ink-700">
                        <dt>Total</dt>
                        <dd className="tnum">{formatCents(balances.visibleTotal)}</dd>
                      </div>
                    </dl>
                  </Link>
                </Card>
              );
            })}
          </div>

          <Card className="h-fit">
            <h2 className="mb-1 text-lg font-semibold">Recent activity</h2>
            <p className="mb-4 text-xs text-ink-400">
              Check here before recording something — it is how you avoid both
              entering the same purchase.
            </p>

            {activity.length === 0 ? (
              <p className="text-sm text-ink-400">Nothing recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map(({ entry, accountType, childName }) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 border-b border-ink-100 pb-3 last:border-0 last:pb-0 dark:border-ink-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{entry.description}</p>
                      <p className="text-xs text-ink-400">
                        {childName} · {ACCOUNT_LABELS[accountType]} ·{" "}
                        {LEDGER_TYPE_LABELS[entry.type]}
                      </p>
                      <p className="text-xs text-ink-400">
                        {entry.actorUserId
                          ? `${actorNames.get(entry.actorUserId) ?? "Someone"} · `
                          : ""}
                        {relativeTime(entry.postedAt)}
                      </p>
                    </div>
                    <span
                      className={`tnum whitespace-nowrap text-sm ${
                        entry.amountCents < 0
                          ? "text-ink-600 dark:text-ink-300"
                          : "text-ledger-600 dark:text-ledger-500"
                      }`}
                    >
                      {entry.amountCents > 0 ? "+" : ""}
                      {formatCents(entry.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500 dark:text-ink-300">{label}</dt>
      <dd className="tnum">{formatCents(cents)}</dd>
    </div>
  );
}
