import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, getAccounts, getChild } from "@/lib/children";
import { formatCents } from "@/lib/money";
import { EditChildForm } from "./edit-child-form";

const ACCOUNT_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  generosity: "Generosity",
  held: "Held for the future",
};

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();

  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const accounts = getAccounts(childId);
  const visible = accounts.filter((a) => a.visibleToChild);
  const held = accounts.find((a) => !a.visibleToChild);

  return (
    <>
      <PageHeader
        title={record.displayName}
        subtitle={`${ageFromBirthdate(record.birthdate)} years old · born ${record.birthdate}`}
        action={
          <Link href="/children" className="text-sm text-ink-400 hover:underline">
            ← All children
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Accounts</h2>
            <dl className="space-y-3">
              {visible.map((acct) => (
                <div
                  key={acct.id}
                  className="flex items-center justify-between border-b border-ink-100 pb-3 last:border-0 last:pb-0 dark:border-ink-700"
                >
                  <dt className="text-sm text-ink-500 dark:text-ink-300">
                    {ACCOUNT_LABELS[acct.type]}
                  </dt>
                  <dd className="tnum text-lg">{formatCents(acct.balanceCents)}</dd>
                </div>
              ))}
            </dl>

            {held && (
              <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      {ACCOUNT_LABELS.held}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                      Parents only. Never shown to {record.displayName} or on the
                      kiosk.
                    </p>
                  </div>
                  <span className="tnum text-lg text-amber-900 dark:text-amber-200">
                    {formatCents(held.balanceCents)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Alert tone="info">
            Responsibilities, pay stubs, bills, and the ledger arrive in later phases.
            This page currently covers the child record and their accounts.
          </Alert>
        </div>

        <EditChildForm
          child={{
            id: record.id,
            displayName: record.displayName,
            birthdate: record.birthdate,
            status: record.status,
            photoBlobId: record.photoBlobId,
          }}
        />
      </div>
    </>
  );
}
