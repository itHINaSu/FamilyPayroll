"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { ChildWeek } from "@/lib/today";
import { Avatar, BoxButton, MissNoteSheet, type NotePrompt } from "./expectations/week-card";

/**
 * One child's day: this week's pay so far, and today's boxes to tap.
 * Day-based expectations show today's box; "once a week" and "N times a
 * week" show the week's numbered boxes, since any day counts. The full week
 * is on the Expectations tab.
 */
export function TodayCard({ child, today }: { child: ChildWeek; today: string }) {
  const [prompt, setPrompt] = useState<NotePrompt | null>(null);

  const rows = child.expectations.map((e) => {
    const week = e.weeks[child.currentWeek] ?? e.weeks[0];
    const boxes = week
      ? week.boxes.filter((b) => b.numbered || b.date === today)
      : [];
    return { e, week, boxes };
  });
  const due = rows.filter((r) => r.boxes.length > 0);
  const notToday = rows.filter((r) => r.boxes.length === 0);

  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={child.name} photoBlobId={child.photoBlobId} />
        <div className="min-w-0 flex-1">
          <Link href={`/children/${child.id}`} className="block font-medium hover:underline">
            {child.name}
          </Link>
          <p className="text-xs text-ink-400">
            {child.age} yrs ·{" "}
            <span className="whitespace-nowrap">{formatCents(child.checkingCents)} checking</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum whitespace-nowrap text-lg">
            {formatCents(child.onTrackCents)}
            <span className="text-sm text-ink-400"> / {formatCents(child.potentialCents)}</span>
          </p>
          <p className="text-xs text-ink-400">
            {child.lostCents > 0 ? (
              <span className="text-red-600 dark:text-red-400">
                −{formatCents(child.lostCents)} missed
              </span>
            ) : (
              `paid ${formatShortDate(child.period.payDate)}`
            )}
          </p>
        </div>
      </div>

      {child.expectations.length === 0 ? (
        <p className="text-sm text-ink-400">
          No expectations yet.{" "}
          <Link href="/responsibilities" className="underline">
            Set them up
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="divide-y divide-ink-100 dark:divide-ink-700">
            {due.map(({ e, week, boxes }) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm">{e.name}</p>
                  <p className="text-xs">
                    {e.payMode === "expected" ? (
                      e.lostCents > 0 ? (
                        <span className="text-red-600 dark:text-red-400">
                          −{formatCents(e.lostCents)} this week
                        </span>
                      ) : (
                        <span className="text-ink-400">{formatCents(e.potentialCents)}/week</span>
                      )
                    ) : (
                      <span className="text-ink-400">
                        {formatCents(e.earnedCents)} of {formatCents(e.potentialCents)} earned
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {boxes.map((b) => (
                    <BoxButton
                      key={b.key}
                      box={b}
                      weekEnd={week!.end}
                      childId={child.id}
                      expectation={e}
                      today={today}
                      onMiss={setPrompt}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>

          {notToday.length > 0 && (
            <p className="mt-2 border-t border-ink-100 pt-2 text-xs text-ink-400 dark:border-ink-700">
              Not today: {notToday.map((r) => r.e.name).join(" · ")}
            </p>
          )}
        </>
      )}

      <MissNoteSheet childId={child.id} prompt={prompt} onClose={() => setPrompt(null)} />
    </Card>
  );
}
