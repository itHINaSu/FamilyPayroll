import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { jumpTargetId } from "@/components/jump-target";
import { dayOfWeek, eachDate, formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DAY_LETTERS, type Box } from "@/lib/responsibilities";
import type { ChildWeek, ExpectationView } from "@/lib/today";
import { WalletIcon } from "./icons";

type Day = { date: string; letter: string; isToday: boolean };

function markLook(box: Box) {
  if (box.state === "missed") return "bg-red-500 text-white";
  if (box.future) return "bg-ink-100 text-ink-400 dark:bg-ink-700 dark:text-ink-400";
  if (box.state === "met" || box.state === "done") return "bg-ledger-600 text-white";
  if (box.state === "excused") return "bg-ink-200 text-ink-400 dark:bg-ink-600";
  // Open: could still be done.
  return "border border-ink-300 text-ink-400 dark:border-ink-500";
}

/** A tiny square carrying its own day letter (or count), coloured by state. */
function Mark({ box, label, isToday }: { box: Box; label: string; isToday?: boolean }) {
  return (
    <span
      className={`flex h-3 w-3 items-center justify-center rounded-[3px] text-[9px] font-bold leading-none ${markLook(box)} ${
        isToday ? "ring-1 ring-ledger-500 ring-offset-1 dark:ring-offset-ink-800" : ""
      }`}
    >
      {label}
    </span>
  );
}

/**
 * One expectation: its short name, then a square for each day it happens —
 * a Mon/Wed/Fri expectation has only those three. "N times a week" items
 * have no day of their own, so their squares are numbered instead.
 */
function Row({ e, week, days }: { e: ExpectationView; week: number; days: Day[] }) {
  const boxes = e.weeks[week]?.boxes ?? [];
  const numbered = boxes.filter((b) => b.numbered);

  return (
    <>
      <span className="truncate pr-1 text-[11px] leading-3" title={e.name}>
        {e.shortName || e.name}
      </span>
      {numbered.length > 0 ? (
        <span className="col-span-7 flex gap-0.5">
          {numbered.map((b) => (
            <Mark key={b.key} box={b} label={b.label} />
          ))}
        </span>
      ) : (
        days.map((d) => {
          const box = boxes.find((b) => !b.numbered && b.date === d.date);
          return box ? (
            <Mark key={d.date} box={box} label={d.letter} isToday={d.isToday} />
          ) : (
            <span key={d.date} />
          );
        })
      )}
    </>
  );
}

/**
 * One child on the Dashboard, read-only: every expectation's week as rows of
 * lettered squares, checking up by the name. The balance opens Balances at this child;
 * anywhere else opens Expectations at this child.
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
  const weekRange = child.expectations[0]?.weeks[child.currentWeek];
  const days: Day[] = weekRange
    ? eachDate(weekRange.start, weekRange.end).map((date) => ({
        date,
        letter: DAY_LETTERS[dayOfWeek(date)],
        isToday: date === today,
      }))
    : [];
  const missCount = child.expectations.reduce((n, e) => n + e.misses.length, 0);

  // More than three: two columns, so a long list still fits four kids on a phone.
  const list = child.expectations;
  const half = Math.ceil(list.length / 2);
  const columns = list.length > 3 ? [list.slice(0, half), list.slice(half)] : [list];
  const expectationsHref = `/expectations#${jumpTargetId(child.id)}`;

  return (
    <div className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 shadow-sm dark:border-ink-700 dark:bg-ink-800">
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

      <Link href={expectationsHref} className="mt-1.5 block">
        {list.length === 0 ? (
          <p className="text-sm text-ink-400">No expectations yet</p>
        ) : (
          <>
            <div className={`grid gap-x-4 ${columns.length > 1 ? "grid-cols-2" : ""}`}>
              {columns.map((col, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_repeat(7,0.75rem)] content-start items-center gap-0.5"
                >
                  {col.map((e) => (
                    <Row key={e.id} e={e} week={child.currentWeek} days={days} />
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
              {missCount > 0 ? (
                <span className="text-red-600 dark:text-red-400">
                  −{formatCents(child.lostCents)} · {missCount} missed
                </span>
              ) : (
                <span className="text-ink-400">Nothing missed</span>
              )}
              <span className="tnum whitespace-nowrap">
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
