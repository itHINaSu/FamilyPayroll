import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { jumpTargetId } from "@/components/jump-target";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { Box } from "@/lib/responsibilities";
import type { ChildWeek } from "@/lib/today";

type Dot = "met" | "missed" | "open";

/** Today's state for each expectation that has a box today (or this week, for "N times a week"). */
function todayDots(child: ChildWeek, today: string): Dot[] {
  const dots: Dot[] = [];
  for (const e of child.expectations) {
    const week = e.weeks[child.currentWeek] ?? e.weeks[0];
    if (!week) continue;
    const day = week.boxes.find((b) => !b.numbered && b.date === today);
    const boxes: Box[] = day ? [day] : week.boxes.filter((b) => b.numbered);
    if (boxes.length === 0) continue;
    dots.push(
      boxes.some((b) => b.state === "missed")
        ? "missed"
        : boxes.every((b) => b.state === "met" || b.state === "done" || b.state === "excused")
          ? "met"
          : "open",
    );
  }
  return dots;
}

const half =
  "block min-w-0 rounded-lg bg-ink-50 px-3 py-1.5 transition active:bg-ink-100 dark:bg-ink-900 dark:active:bg-ink-700";

/**
 * One child on the Dashboard: expectations on the left, money on the right.
 * Read-only — each half jumps to that child on the tab where changes happen.
 */
export function KidSummary({ child, today }: { child: ChildWeek; today: string }) {
  const dots = todayDots(child, today);
  const misses = child.expectations.reduce((n, e) => n + e.misses.length, 0);

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-sm dark:border-ink-700 dark:bg-ink-800">
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar name={child.name} photoBlobId={child.photoBlobId} size="xs" />
        <p className="min-w-0 flex-1 truncate font-medium">{child.name}</p>
        <p className="shrink-0 text-xs text-ink-400">paid {formatShortDate(child.period.payDate)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/expectations#${jumpTargetId(child.id)}`} className={half}>
          <p className="tnum whitespace-nowrap">
            {formatCents(child.onTrackCents)}
            <span className="text-xs text-ink-400"> / {formatCents(child.potentialCents)}</span>
          </p>
          <p className="truncate text-xs">
            {child.lostCents > 0 ? (
              <span className="text-red-600 dark:text-red-400">
                {misses} miss{misses === 1 ? "" : "es"} · −{formatCents(child.lostCents)}
              </span>
            ) : child.expectations.length === 0 ? (
              <span className="text-ink-400">No expectations</span>
            ) : (
              <span className="text-ink-400">On track</span>
            )}
          </p>
          {dots.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1" aria-label="Today">
              {dots.map((d, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full ${
                    d === "met"
                      ? "bg-ledger-600"
                      : d === "missed"
                        ? "bg-red-500"
                        : "border border-ink-300 dark:border-ink-500"
                  }`}
                />
              ))}
            </p>
          )}
        </Link>

        <Link href={`/balances#${jumpTargetId(child.id)}`} className={half}>
          <p className="tnum whitespace-nowrap">
            <span className={child.checkingCents < 0 ? "text-red-600 dark:text-red-400" : ""}>
              {formatCents(child.checkingCents)}
            </span>
            <span className="text-xs text-ink-400"> checking</span>
          </p>
          <p className="tnum truncate text-xs text-ink-400">
            {formatCents(child.savingsCents)} savings
          </p>
          {child.shortfall ? (
            <p className="truncate text-xs text-amber-700 dark:text-amber-300">
              {child.shortfall.billName}: {formatCents(child.shortfall.shortCents)} short
            </p>
          ) : child.nextBill ? (
            <p className="flex gap-1 text-xs text-ink-400">
              <span className="truncate">{child.nextBill.name}</span>
              <span className="shrink-0">{formatShortDate(child.nextBill.dueDate)}</span>
            </p>
          ) : null}
        </Link>
      </div>
    </div>
  );
}
