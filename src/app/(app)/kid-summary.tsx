import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { jumpTargetId } from "@/components/jump-target";
import { dayOfWeek, eachDate, formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DAY_LETTERS } from "@/lib/responsibilities";
import type { ChildWeek } from "@/lib/today";
import { WalletIcon } from "./icons";

type DayState = "met" | "missed" | "open" | "none" | "future";

/**
 * This week as seven days: red if anything was missed that day, green if
 * everything due was kept, grey ahead of today. "N times a week" items
 * have no day of their own, so they show up in the misses line instead.
 */
function weekDays(child: ChildWeek, today: string) {
  const week = child.expectations[0]?.weeks[child.currentWeek];
  if (!week) return [];
  return eachDate(week.start, week.end).map((date) => {
    const boxes = child.expectations.flatMap((e) =>
      (e.weeks[child.currentWeek]?.boxes ?? []).filter(
        (b) => !b.numbered && b.date === date && b.state !== "excused",
      ),
    );
    const state: DayState =
      date > today
        ? "future"
        : boxes.some((b) => b.state === "missed")
          ? "missed"
          : boxes.length === 0
            ? "none"
            : boxes.some((b) => b.state === "met" || b.state === "done")
              ? "met"
              : "open";
    return { date, letter: DAY_LETTERS[dayOfWeek(date)], state, isToday: date === today };
  });
}

const DAY_LOOK: Record<DayState, string> = {
  met: "bg-ledger-600 text-white",
  missed: "bg-red-500 text-white",
  open: "bg-ink-200 text-ink-500 dark:bg-ink-600 dark:text-ink-200",
  none: "bg-ink-50 text-ink-300 dark:bg-ink-900 dark:text-ink-600",
  future: "bg-ink-100 text-ink-400 dark:bg-ink-700 dark:text-ink-400",
};

/**
 * One child on the Dashboard, read-only: this week's expectations across
 * the card, checking up by the name. The balance opens Balances at this
 * child; anywhere else opens Expectations at this child.
 */
export function KidSummary({
  child,
  today,
  showPayDate,
}: {
  child: ChildWeek;
  today: string;
  /** Only when this child is paid on a different day from the rest. */
  showPayDate: boolean;
}) {
  const days = weekDays(child, today);
  const missed = child.expectations
    .filter((e) => e.misses.length > 0)
    .map((e) => (e.misses.length > 1 ? `${e.name} ×${e.misses.length}` : e.name));
  const missCount = child.expectations.reduce((n, e) => n + e.misses.length, 0);
  const pct = (cents: number) =>
    child.potentialCents > 0 ? `${Math.min(100, (cents / child.potentialCents) * 100)}%` : "0%";
  const expectationsHref = `/expectations#${jumpTargetId(child.id)}`;

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-sm dark:border-ink-700 dark:bg-ink-800">
      <div className="flex items-center gap-2">
        <Link href={expectationsHref} className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar name={child.name} photoBlobId={child.photoBlobId} size="xs" />
          <span className="truncate font-medium">{child.name}</span>
          {showPayDate && (
            <span className="shrink-0 text-xs text-ink-400">
              paid {formatShortDate(child.period.payDate)}
            </span>
          )}
        </Link>
        <Link
          href={`/balances#${jumpTargetId(child.id)}`}
          title={child.shortfall ? `${child.shortfall.billName} is short` : "Checking"}
          className={`tnum inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition ${
            child.shortfall
              ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              : "bg-ink-50 active:bg-ink-100 dark:bg-ink-900"
          }`}
        >
          <WalletIcon className="h-4 w-4 text-ink-400" />
          <span className={child.checkingCents < 0 ? "text-red-600 dark:text-red-400" : ""}>
            {formatCents(child.checkingCents)}
          </span>
          <span className="sr-only">checking</span>
        </Link>
      </div>

      <Link href={expectationsHref} className="mt-2 block">
        {child.expectations.length === 0 ? (
          <p className="text-sm text-ink-400">No expectations yet</p>
        ) : (
          <>
            {days.length > 0 && (
              <div className="grid grid-cols-7 gap-1" aria-label="This week">
                {days.map((d) => (
                  <span
                    key={d.date}
                    className={`flex h-6 items-center justify-center rounded text-[11px] font-semibold ${DAY_LOOK[d.state]} ${
                      d.isToday ? "ring-2 ring-ledger-500/50 ring-offset-1 dark:ring-offset-ink-800" : ""
                    }`}
                  >
                    {d.letter}
                  </span>
                ))}
              </div>
            )}

            <div
              className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-700"
              aria-hidden="true"
            >
              <span className="bg-ledger-600" style={{ width: pct(child.onTrackCents) }} />
              <span className="bg-red-500" style={{ width: pct(child.lostCents) }} />
            </div>

            <div className="mt-1 flex items-start justify-between gap-3 text-xs">
              <span className="line-clamp-2 min-w-0">
                {missCount > 0 ? (
                  <span className="text-red-600 dark:text-red-400">
                    {missCount} missed · {missed.join(" · ")}
                  </span>
                ) : (
                  <span className="text-ink-400">Nothing missed</span>
                )}
              </span>
              <span className="tnum shrink-0 whitespace-nowrap">
                {formatCents(child.onTrackCents)}
                <span className="text-ink-400"> / {formatCents(child.potentialCents)}</span>
              </span>
            </div>
          </>
        )}
      </Link>
    </div>
  );
}
