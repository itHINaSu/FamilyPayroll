import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";

import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { ledgerEntry, user } from "@/db/schema";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, getChild } from "@/lib/children";
import { getBalances, listLedger, LEDGER_TYPE_LABELS } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { EditChildForm } from "./edit-child-form";
import { LedgerTable, type LedgerRow } from "./ledger-table";
import { MoneyForms } from "./money-forms";

export const dynamic = "force-dynamic";

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();

  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const home = getHousehold();
  const balances = getBalances(childId);
  const entries = listLedger(childId, 100);

  // Which entries have been reversed, so the table can strike them through.
  const reversedIds = new Set(
    db
      .select({ id: ledgerEntry.reversesEntryId })
      .from(ledgerEntry)
      .where(eq(ledgerEntry.childId, childId))
      .all()
      .map((r) => r.id)
      .filter((id): id is string => !!id),
  );

  const actorIds = [
    ...new Set(entries.map((e) => e.entry.actorUserId).filter((id): id is string => !!id)),
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

  const rows: LedgerRow[] = entries.map(({ entry, accountType }) => ({
    id: entry.id,
    amountCents: entry.amountCents,
    type: entry.type,
    typeLabel: LEDGER_TYPE_LABELS[entry.type],
    accountType,
    description: entry.description,
    memo: entry.memo,
    occurredAt: entry.occurredAt,
    actorName: entry.actorUserId ? (actorNames.get(entry.actorUserId) ?? null) : null,
    isReversed: reversedIds.has(entry.id),
    isReversal: entry.type === "reversal",
  }));

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
              <BalanceRow label="Checking" cents={balances.checking} />
              <BalanceRow
                label="Savings"
                cents={balances.savings}
                detail={
                  balances.savingsEarmarked > 0
                    ? `${formatCents(balances.savingsGeneral)} general · ${formatCents(
                        balances.savingsEarmarked,
                      )} toward goals`
                    : undefined
                }
              />
              <BalanceRow label="Generosity" cents={balances.generosity} />
              <div className="flex items-center justify-between border-t border-ink-200 pt-3 font-medium dark:border-ink-700">
                <dt>Total</dt>
                <dd className="tnum text-lg">{formatCents(balances.visibleTotal)}</dd>
              </div>
            </dl>

            <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Held for the future
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                    Parents only. Never shown to {record.displayName} or on the
                    kiosk, and excluded from the total above.
                  </p>
                </div>
                <span className="tnum text-lg text-amber-900 dark:text-amber-200">
                  {formatCents(balances.held)}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Ledger</h2>
              <span className="text-xs text-ink-400">
                Corrections post a reversing entry; nothing is deleted.
              </span>
            </div>
            <LedgerTable
              rows={rows}
              childId={childId}
              timezone={home?.timezone ?? "UTC"}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <MoneyForms childId={childId} />
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
      </div>
    </>
  );
}

function BalanceRow({
  label,
  cents,
  detail,
}: {
  label: string;
  cents: number;
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between border-b border-ink-100 pb-3 dark:border-ink-700">
      <dt className="text-sm text-ink-500 dark:text-ink-300">
        {label}
        {detail && <span className="block text-xs text-ink-400">{detail}</span>}
      </dt>
      <dd className="tnum text-lg">{formatCents(cents)}</dd>
    </div>
  );
}
