"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Sheet } from "@/components/sheet";
import { Button, Card } from "@/components/ui";
import { formatCents } from "@/lib/money";
import type { ChildWeek } from "@/lib/today";
import { MoneyForms } from "./children/[childId]/money-forms";
import { Avatar } from "./expectations/week-card";

/**
 * A child at a glance: what's in checking, what this week is on track to
 * pay, and the two things a parent most often does next.
 */
export function ChildSummaryCard({ child }: { child: ChildWeek }) {
  const [adding, setAdding] = useState(false);
  const close = useCallback(() => setAdding(false), []);

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name={child.name} photoBlobId={child.photoBlobId} />
        <div className="min-w-0 flex-1">
          <Link href={`/children/${child.id}`} className="block truncate font-medium hover:underline">
            {child.name}
          </Link>
          <p className="text-xs text-ink-400">{child.age} yrs</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
          <dt className="text-xs text-ink-400">Checking</dt>
          <dd className="tnum text-xl">{formatCents(child.checkingCents)}</dd>
        </div>
        <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
          <dt className="text-xs text-ink-400">This week</dt>
          <dd className="tnum text-xl">{formatCents(child.onTrackCents)}</dd>
          <dd className="tnum text-xs text-ink-400">of {formatCents(child.potentialCents)}</dd>
          {child.lostCents > 0 && (
            <dd className="text-xs text-red-600 dark:text-red-400">
              −{formatCents(child.lostCents)} missed
            </dd>
          )}
        </div>
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={`/children/${child.id}/responsibilities`}
          className="flex items-center justify-center rounded-lg bg-ink-100 px-3 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-200 dark:bg-ink-700 dark:text-ink-100 dark:hover:bg-ink-600"
        >
          Expectations
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
