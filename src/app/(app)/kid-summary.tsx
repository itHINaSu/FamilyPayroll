import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { jumpTargetId } from "@/components/jump-target";
import { dayOfWeek, eachDate, formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DAY_LETTERS, type Box } from "@/lib/responsibilities";
import type { ChildWeek, ExpectationView } from "@/lib/today";
import { WalletIcon } from "./icons";

type Day = { date: string; letter: string; isToday: boolean };

/** Shading for today's column, so it reads straight down the grid. */
const TODAY = "bg-ledger-100 dark:bg-ledger-600/25";

function dotLook(box: Box) {
  if (box.state === "missed") return "bg-red-500";
  if (box.future) return "bg-ink-200 dark:bg-ink-600";
  if (box.state === "met" || box.state === "done") return "bg-ledger-600";
  if (box.state === "excused") return "bg-ink-300 dark:bg-ink-500";
  return "border border-ink-400 dark:border-ink-400"; // open: could still be done
}

/** One expectation: its short name, then a dot per day (or its N marks). */
function Row({ e, week, days }: { e: ExpectationView; week: number; days: Day[] }) {
  const boxes = e.weeks[week]?.boxes ?? [];
  const numbered = boxes.filter((b) => b.numbered);

  return (
    <>
      <span className="truncate pr-1 text-[11px] leading-[0.875rem]" title={e.name}>
        {e.shortName || e.name}
      </span>
      {numbered.length > 0 ? (
        // "N times a week" has no day of its own: a bar across the whole week,
        // one segment per time, so it can't be mistaken for a single day.
        <span className="col-span-7 flex h-3.5 items-center gap-[3px] px-0.5">
          {numbered.map((b) => (
            <span key={b.key} className={`h-1.5 flex-1 rounded-full ${dotLook(b)}`} />
          ))}
        </span>
      ) : (
        days.map((d) => {
          const box = boxes.find((b) => !b.numbered && b.date === d.date);
          return (
            <span
              key={d.date}
              className={`flex h-3.5 items-center justify-center ${d.isToday ? TODAY : ""}`}
            >
              {box && <span className={`h-[7px] w-[7px] rounded-full ${dotLook(box)}`} />}
            </span>
          );
        })
      )}
    </>
  );
}

/**
 * One child on the Dashboard, read-only: every expectation's week as rows of
 * dots, checking up by the name. The balance opens Balances at this child;
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
                  className="grid grid-cols-[minmax(0,1fr)_repeat(7,0.625rem)] content-start items-center gap-x-[3px]"
                >
                  <span />
                  {days.map((d) => (
                    <span
                      key={d.date}
                      className={`rounded-t-sm text-center text-[9px] leading-3 ${
                        d.isToday ? `${TODAY} font-bold text-ledger-600 dark:text-ledger-500` : "text-ink-400"
                      }`}
                    >
                      {d.letter}
                    </span>
                  ))}
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
