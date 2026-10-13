"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Sheet } from "@/components/sheet";
import { Button, Card } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { MoneyForms } from "../children/[childId]/money-forms";
import { Avatar } from "../expectations/week-card";

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

/** A child's money at a glance, with history and a new transaction one tap away. */
export function BalanceCard({ child }: { child: BalanceView }) {
  const [adding, setAdding] = useState(false);
  const close = useCallback(() => setAdding(false), []);

  const tiles = [
    { label: "Checking", cents: child.checkingCents },
    { label: "Savings", cents: child.savingsCents },
    { label: "Generosity", cents: child.generosityCents },
  ];

  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={child.name} photoBlobId={child.photoBlobId} />
        <Link href={`/children/${child.id}`} className="min-w-0 flex-1 font-medium hover:underline">
          {child.name}
        </Link>
        <div className="shrink-0 text-right">
          <p className="tnum text-lg">{formatCents(child.totalCents)}</p>
          <p className="text-xs text-ink-400">total</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-900">
            <dt className="text-xs text-ink-400">{t.label}</dt>
            <dd className="tnum">{formatCents(t.cents)}</dd>
          </div>
        ))}
        <div
          className={`rounded-lg px-3 py-2 ${
            child.nextBill && child.nextBill.shortCents > 0
              ? "bg-amber-50 dark:bg-amber-950"
              : "bg-ink-50 dark:bg-ink-900"
          }`}
        >
          <dt className="text-xs text-ink-400">Bills due</dt>
          <dd className="tnum">{formatCents(child.billsDueCents)}</dd>
          {child.nextBill && (
            <dd className="truncate text-[11px] text-ink-400">
              {child.nextBill.shortCents > 0 ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {formatCents(child.nextBill.shortCents)} short ·{" "}
                </span>
              ) : null}
              {child.nextBill.name} {formatShortDate(child.nextBill.dueDate)}
            </dd>
          )}
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={`/children/${child.id}`}
          className="flex items-center justify-center rounded-lg bg-ink-100 px-3 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-200 dark:bg-ink-700 dark:text-ink-100 dark:hover:bg-ink-600"
        >
          History
        </Link>
        <Button type="button" onClick={() => setAdding(true)} className="!py-2.5">
          Add transaction
        </Button>
      </div>

      <Sheet open={adding} onClose={close} title={`Money for ${child.name}`}>
        <MoneyForms childId={child.id} onDone={close} bare />
      </Sheet>
    </Card>
  );
}
