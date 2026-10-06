"use client";

import Link from "next/link";

import { Card } from "@/components/ui";
import { formatCents } from "@/lib/money";
import type { TodayChild } from "@/lib/today";
import { tickToday, untickToday } from "./today-actions";
import { formatShortDate } from "@/lib/dates";

/**
 * One child's day.
 *
 * Everything on this card is either a tap or a number they will care about.
 * Items that do not apply today are shown greyed rather than hidden, so the
 * list does not reshuffle from day to day and become hard to scan.
 */
export function TodayCard({ child, today }: { child: TodayChild; today: string }) {
  const dueToday = child.items.filter((i) => i.dueToday && !i.excusedToday);
  const notToday = child.items.filter((i) => !i.dueToday || i.excusedToday);

  const doneCount = dueToday.filter((i) => i.doneToday).length;
  const allDone = dueToday.length > 0 && doneCount === dueToday.length;

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        {child.photoBlobId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/blobs/${child.photoBlobId}`}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-ink-100 font-semibold text-ink-400 dark:bg-ink-700">
            {child.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <Link href={`/children/${child.id}`} className="font-medium hover:underline">
            {child.name}
          </Link>
          <p className="text-xs text-ink-400">
            {child.age} yrs · <span className="whitespace-nowrap">{formatCents(child.balanceCents)} saved</span>
            {child.status === "pre_participant" && " · not yet earning"}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="tnum whitespace-nowrap text-lg">
            {formatCents(child.earnedCents)}
            <span className="text-sm text-ink-400">
              {" "}
              / {formatCents(child.potentialCents)}
            </span>
          </p>
          <p className="text-xs text-ink-400">payday {formatShortDate(child.payDate)}</p>
        </div>
      </div>

      {child.items.length === 0 ? (
        <p className="text-sm text-ink-400">
          No responsibilities yet.{" "}
          <Link
            href={`/children/${child.id}/responsibilities`}
            className="underline"
          >
            Add some
          </Link>
          .
        </p>
      ) : (
        <>
          {allDone && (
            <p className="mb-3 rounded-lg bg-ledger-100 px-3 py-2 text-sm text-ledger-600">
              Everything done today.
            </p>
          )}

          <ul className="space-y-1.5">
            {dueToday.map((item) => (
              <li key={item.responsibilityId}>
                <form action={tickToday} className="flex items-center gap-3">
                  <input
                    type="hidden"
                    name="responsibilityId"
                    value={item.responsibilityId}
                  />
                  <input type="hidden" name="childId" value={child.id} />
                  <input type="hidden" name="date" value={today} />
                  <input
                    type="hidden"
                    name="repeatable"
                    value={String(item.repeatable)}
                  />

                  <button
                    type="submit"
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-sm transition ${
                      item.doneToday
                        ? "border-ledger-600 bg-ledger-600 text-white"
                        : "border-ink-300 hover:border-ledger-500 dark:border-ink-600"
                    }`}
                    aria-label={`Mark ${item.name} done`}
                  >
                    {item.repeatable
                      ? item.doneTodayCount > 0
                        ? item.doneTodayCount
                        : "+"
                      : item.doneToday
                        ? "✓"
                        : ""}
                  </button>

                  <span
                    className={`min-w-0 flex-1 text-sm ${
                      item.doneToday && !item.repeatable ? "text-ink-400" : ""
                    }`}
                  >
                    {item.name}
                    <span className="block text-xs text-ink-400">
                      {item.weekCompleted}/{item.weekChances} this week
                    </span>
                  </span>

                  {item.remainingCents > 0 && (
                    <span className="tnum shrink-0 text-xs text-ledger-600 dark:text-ledger-500">
                      {formatCents(item.remainingCents)} left
                    </span>
                  )}
                </form>

                {item.repeatable && item.doneTodayCount > 0 && (
                  <form action={untickToday} className="pl-11">
                    <input
                      type="hidden"
                      name="responsibilityId"
                      value={item.responsibilityId}
                    />
                    <input type="hidden" name="childId" value={child.id} />
                    <input type="hidden" name="date" value={today} />
                    <button
                      type="submit"
                      className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                    >
                      undo one
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {notToday.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-ink-100 pt-3 dark:border-ink-700">
              {notToday.map((item) => (
                <li
                  key={item.responsibilityId}
                  className="flex items-center gap-3 text-sm text-ink-400"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
                    ·
                  </span>
                  <span className="flex-1">
                    {item.name}
                    <span className="ml-2 text-xs">
                      {item.excusedToday ? "excused today" : "not today"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
