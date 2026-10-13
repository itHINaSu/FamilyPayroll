import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { BackChevron, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { payPeriod, paystub } from "@/db/schema";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { upcomingBills } from "@/lib/bills";
import { getChild } from "@/lib/children";
import { formatShortDate } from "@/lib/dates";
import { childHistory } from "@/lib/history";
import { getBalances } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { ChevronRightIcon } from "../../icons";
import { AddMoneyButton } from "../add-money";
import { moneyKid } from "../data";
import { CollectButton } from "./collect-button";
import { HistoryList } from "./history-list";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "upcoming",
  due: "due",
  partially_paid: "partly paid",
  past_due: "past due",
};

/** One child's account: balances, what's coming due, and everything that happened. */
export default async function AccountPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const parent = await requireParent();
  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const home = getHousehold();
  const balances = getBalances(childId);
  const bills = upcomingBills(childId, 45);
  const history = childHistory(childId);
  const draft = db
    .select({ stub: paystub, period: payPeriod })
    .from(paystub)
    .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
    .where(and(eq(paystub.childId, childId), eq(paystub.status, "draft")))
    .get();

  const negative = (c: number) => (c < 0 ? "text-red-600 dark:text-red-400" : "");

  return (
    <>
      <PageHeader
        title={record.displayName}
        back={
          <Link href={`/balances#child-${childId}`} title="Balances">
            <BackChevron label="Balances" />
          </Link>
        }
        action={<AddMoneyButton kids={[moneyKid(parent.householdId, record)]} />}
      />

      <div className="mx-auto max-w-2xl space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Checking">
            <span className={negative(balances.checking)}>{formatCents(balances.checking)}</span>
          </Tile>
          <Link href={`/balances/${childId}/goals`} className="block h-full">
            <Tile
              label="Savings"
              hint={
                balances.savingsEarmarked > 0
                  ? `${formatCents(balances.savingsEarmarked)} toward goals`
                  : "Goals"
              }
              chevron
            >
              <span className={negative(balances.savings)}>{formatCents(balances.savings)}</span>
            </Tile>
          </Link>
          <Tile label="Generosity">
            <span className={negative(balances.generosity)}>{formatCents(balances.generosity)}</span>
          </Tile>
          <Tile label="Held" hint="Parents only" amber>
            <span className={negative(balances.held)}>{formatCents(balances.held)}</span>
          </Tile>
        </div>

        {draft && (
          <Link
            href={`/balances/${childId}/stubs/${draft.stub.id}`}
            className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm dark:border-ink-700 dark:bg-ink-800"
          >
            <span className="min-w-0 flex-1">
              Next paycheck
              <span className="block text-xs text-ink-400">
                Draft · posts {formatShortDate(draft.period.payDate)}
              </span>
            </span>
            <span className="tnum">{formatCents(draft.stub.netCents)}</span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-300 dark:text-ink-500" />
          </Link>
        )}

        {bills.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Bills coming up</h2>
            <ul className="divide-y divide-ink-100 dark:divide-ink-700">
              {bills.map((b) => (
                <li key={b.instanceId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 text-sm">
                    {b.billName}
                    <span className="block text-xs text-ink-400">
                      {formatShortDate(b.dueDate)} · {STATUS_LABELS[b.status] ?? b.status}
                      {b.shortfallCents > 0 && (
                        <span className="text-amber-700 dark:text-amber-300">
                          {" "}
                          · {formatCents(b.shortfallCents)} short
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-sm">{formatCents(b.outstandingCents)}</span>
                  <CollectButton instanceId={b.instanceId} childId={childId} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">History</h2>
          <HistoryList rows={history} childId={childId} timezone={home?.timezone ?? "UTC"} />
        </Card>
      </div>
    </>
  );
}

function Tile({
  label,
  hint,
  chevron,
  amber,
  children,
}: {
  label: string;
  hint?: string;
  chevron?: boolean;
  amber?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex h-full items-center gap-2 rounded-xl border px-4 py-3 ${
        amber
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
          : "border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-400">{label}</p>
        <p className="tnum text-xl">{children}</p>
        {hint && <p className="truncate text-xs text-ink-400">{hint}</p>}
      </div>
      {chevron && <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-300 dark:text-ink-500" />}
    </div>
  );
}
