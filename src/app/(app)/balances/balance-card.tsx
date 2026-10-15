import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { jumpTargetId } from "@/components/jump-target";
import { Card } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { ChevronRightIcon } from "../icons";
import { AddMoneyInline } from "./add-money";
import type { MoneyKid } from "./money-form";

export type BalanceView = {
  id: string;
  name: string;
  photoBlobId: string | null;
  checkingCents: number;
  savingsCents: number;
  generosityCents: number;
  totalCents: number;
  billsDueCents: number;
  nextBill: { name: string; dueDate: string; shortCents: number } | null;
};

/** A child's money at a glance. The name opens their account; the button records money. */
export function BalanceCard({ child, kid }: { child: BalanceView; kid: MoneyKid }) {
  const tiles = [
    { label: "Checking", cents: child.checkingCents },
    { label: "Savings", cents: child.savingsCents },
    { label: "Generosity", cents: child.generosityCents },
  ];
  const short = !!child.nextBill && child.nextBill.shortCents > 0;

  return (
    <div id={jumpTargetId(child.id)} className="jump-target rounded-xl">
      <Card>
        <Link href={`/balances/${child.id}`} className="-m-1 mb-2 flex items-center gap-3 rounded-lg p-1">
          <Avatar name={child.name} photoBlobId={child.photoBlobId} size="sm" />
          <span className="min-w-0 flex-1 truncate font-medium">{child.name}</span>
          <span className="shrink-0 text-right">
            <span className="tnum block text-lg">{formatCents(child.totalCents)}</span>
            <span className="block text-xs text-ink-400">total</span>
          </span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-300 dark:text-ink-500" />
        </Link>

        <dl className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-900">
              <dt className="text-xs text-ink-400">{t.label}</dt>
              <dd className={`tnum ${t.cents < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {formatCents(t.cents)}
              </dd>
            </div>
          ))}
          <div
            className={`rounded-lg px-3 py-2 ${
              short ? "bg-amber-50 dark:bg-amber-950" : "bg-ink-50 dark:bg-ink-900"
            }`}
          >
            <dt className="text-xs text-ink-400">Bills due</dt>
            <dd className="tnum">{formatCents(child.billsDueCents)}</dd>
            {child.nextBill && (
              <dd className="truncate text-[11px] text-ink-400">
                {short && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {formatCents(child.nextBill.shortCents)} short ·{" "}
                  </span>
                )}
                {child.nextBill.name} {formatShortDate(child.nextBill.dueDate)}
              </dd>
            )}
          </div>
        </dl>

        <div className="mt-3 grid">
          <AddMoneyInline kid={kid} />
        </div>
      </Card>
    </div>
  );
}
