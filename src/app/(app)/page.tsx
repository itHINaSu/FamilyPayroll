import Link from "next/link";

import { Alert, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { ageFromBirthdate, getVisibleAccounts, listChildren } from "@/lib/children";
import { formatCents } from "@/lib/money";

export default async function DashboardPage() {
  const sessionUser = await requireUser();
  const children = listChildren(sessionUser.householdId);

  return (
    <>
      <PageHeader
        title="Dashboard"
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
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((c) => {
            // Deliberately the visible-accounts view: the dashboard is shown on
            // shared screens, so the held account must not appear (invariant I4).
            const accounts = getVisibleAccounts(c.id);
            const total = accounts.reduce((sum, a) => sum + a.balanceCents, 0);

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
                    {accounts.map((a) => (
                      <div key={a.id} className="flex justify-between">
                        <dt className="capitalize text-ink-500 dark:text-ink-300">
                          {a.type}
                        </dt>
                        <dd className="tnum">{formatCents(a.balanceCents)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-ink-100 pt-1.5 font-medium dark:border-ink-700">
                      <dt>Total</dt>
                      <dd className="tnum">{formatCents(total)}</dd>
                    </div>
                  </dl>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
