import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { jumpTargetId } from "@/components/jump-target";
import { dayOfWeek, eachDate, formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DAY_LETTERS, type Box } from "@/lib/responsibilities";
import type { ChildWeek, ExpectationView } from "@/lib/today";
import { MissedX, TODAY_RING, boxLook } from "./expectations/box-look";
import { PeriodTotal } from "./expectations/week-card";
import { ChevronRightIcon, WalletIcon } from "./icons";

type Day = { date: string; letter: string; isToday: boolean };

/** A small read-only box, styled exactly like the Expectations tab's. */
function Mark({ box, label, isToday }: { box: Box; label: string; isToday?: boolean }) {
  return (
    <span
      className={`relative flex h-6 w-6 items-center justify-center rounded-md border text-xs font-semibold ${boxLook(box)} ${
        isToday ? TODAY_RING : ""
      }`}
    >
      {label}
      {box.state === "missed" && <MissedX />}
    </span>
  );
}

/**
 * One expectation: its short name, then a box for each day it happens (a
 * Mon/Wed/Fri expectation has only those three) or, for "N times a week",
 * its numbered boxes.
 */
function Row({ e, week, days }: { e: ExpectationView; week: number; days: Day[] }) {
  const boxes = e.weeks[week]?.boxes ?? [];
  const numbered = boxes.filter((b) => b.numbered);

  return (
    <>
      <span className="truncate pr-2 text-sm" title={e.name}>
        {e.shortName || e.name}
      </span>
      {numbered.length > 0 ? (
        <span className="col-span-7 flex gap-1">
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
 * One child on the Dashboard, read-only — the same header as their card on
 * Expectations, their week as rows of small boxes, and their money along the
 * bottom. On a phone two cards fill the screen (FillCards sets --card-h);
 * the jump bar reaches the rest. Rows that don't fit scroll inside the card.
 */
export function KidSummary({ child, today }: { child: ChildWeek; today: string }) {
  const week = child.expectations[0]?.weeks[child.currentWeek];
  const days: Day[] = week
    ? eachDate(week.start, week.end).map((date) => ({
        date,
        letter: DAY_LETTERS[dayOfWeek(date)],
        isToday: date === today,
      }))
    : [];
  const expectationsHref = `/expectations#${jumpTargetId(child.id)}`;

  return (
    <div
      id={jumpTargetId(child.id)}
      className="jump-target flex h-[var(--card-h,auto)] flex-col rounded-xl border border-ink-200 bg-white p-4 shadow-sm md:h-auto dark:border-ink-700 dark:bg-ink-800"
    >
      <Link href={expectationsHref} className="-m-1 mb-1.5 flex shrink-0 items-center gap-3 rounded-lg p-1">
        <Avatar name={child.name} photoBlobId={child.photoBlobId} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{child.name}</span>
          <span className="block text-xs text-ink-400">Paid {formatShortDate(child.period.payDate)}</span>
        </span>
        <PeriodTotal child={child} />
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-300 dark:text-ink-500" />
      </Link>

      <Link
        href={expectationsHref}
        className="block min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {child.expectations.length === 0 ? (
          <p className="text-sm text-ink-400">No expectations yet</p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,1.5rem)] content-start items-center gap-1">
            {child.expectations.map((e) => (
              <Row key={e.id} e={e} week={child.currentWeek} days={days} />
            ))}
          </div>
        )}
      </Link>

      <Link
        href={`/balances#${jumpTargetId(child.id)}`}
        className="mt-2 flex shrink-0 items-center gap-2 border-t border-ink-100 pt-2 text-sm dark:border-ink-700"
      >
        <WalletIcon className="h-4 w-4 shrink-0 text-ink-400" />
        <span className="tnum shrink-0 whitespace-nowrap">
          <span className={child.checkingCents < 0 ? "text-red-600 dark:text-red-400" : ""}>
            {formatCents(child.checkingCents)}
          </span>{" "}
          <span className="text-xs text-ink-400">checking</span>
        </span>
        <span className="tnum shrink-0 whitespace-nowrap">
          {formatCents(child.savingsCents)} <span className="text-xs text-ink-400">savings</span>
        </span>
        {/* Bills themselves are on Balances; here only a shortfall earns room. */}
        <span className="ml-auto min-w-0 truncate text-right text-xs text-amber-700 dark:text-amber-300">
          {child.shortfall && `${formatCents(child.shortfall.shortCents)} short`}
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-300 dark:text-ink-500" />
      </Link>
    </div>
  );
}
