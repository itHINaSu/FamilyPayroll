"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/avatar";
import { jumpTargetId } from "@/components/jump-target";
import { Sheet } from "@/components/sheet";
import { Button, Card, Textarea } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { Box } from "@/lib/responsibilities";
import type { ChildWeek, ExpectationView } from "@/lib/today";
import { ChevronRightIcon } from "../icons";
import { saveMissNote, tapBox } from "./actions";

type NotePrompt = { missId: string; title: string; when: string; note: string };

/**
 * One child's expectations as a week of boxes. Keep-it boxes start checked
 * and unchecking one records a miss (with an optional note for the pay
 * stub); earn-it boxes start empty. `full` shows every week of the pay
 * period instead of just this one.
 */
export function WeekCard({
  child,
  today,
  full = false,
}: {
  child: ChildWeek;
  today: string;
  full?: boolean;
}) {
  const [prompt, setPrompt] = useState<NotePrompt | null>(null);

  const card = (
    // A little less side padding on a phone buys the seven boxes their 44px.
    <Card className="!px-3 sm:!px-6">
      {!full && (
        <Link
          href={`/expectations/${child.id}`}
          className="-m-1 mb-3 flex items-center gap-3 rounded-lg p-1"
        >
          <Avatar name={child.name} photoBlobId={child.photoBlobId} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{child.name}</span>
            <span className="block text-xs text-ink-400">
              Paid {formatShortDate(child.period.payDate)}
            </span>
          </span>
          <PeriodTotal child={child} />
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-300 dark:text-ink-500" />
        </Link>
      )}

      {child.expectations.length === 0 ? (
        <p className="text-sm text-ink-400">
          No expectations yet.{" "}
          <Link href="/responsibilities" className="underline">
            Set them up
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 dark:divide-ink-700">
          {child.expectations.map((e) => (
            <li key={e.id} className="py-3 first:pt-0 last:pb-0">
              <ExpectationRow
                childId={child.id}
                expectation={e}
                weeks={full ? e.weeks : [e.weeks[child.currentWeek] ?? e.weeks[0]]}
                today={today}
                onMiss={setPrompt}
              />
            </li>
          ))}
        </ul>
      )}

      <MissNoteSheet childId={child.id} prompt={prompt} onClose={() => setPrompt(null)} />
    </Card>
  );

  return full ? (
    card
  ) : (
    <div id={jumpTargetId(child.id)} className="jump-target rounded-xl">
      {card}
    </div>
  );
}

export function PeriodTotal({ child }: { child: ChildWeek }) {
  return (
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
          "on track"
        )}
      </p>
    </div>
  );
}

function ExpectationRow({
  childId,
  expectation: e,
  weeks,
  today,
  onMiss,
}: {
  childId: string;
  expectation: ExpectationView;
  weeks: ExpectationView["weeks"];
  today: string;
  onMiss: (p: NotePrompt) => void;
}) {
  const expected = e.payMode === "expected";

  return (
    <>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-sm font-medium">
          {e.name}
          {(!expected || e.allOrNothing) && (
            <span className="ml-1.5 text-xs font-normal text-ink-400">
              {[!expected && "Earn it", e.allOrNothing && "All or nothing"]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </p>
        <p className="tnum shrink-0 whitespace-nowrap text-right text-sm">
          {expected ? (
            e.lostCents > 0 ? (
              <span className="text-red-600 dark:text-red-400">−{formatCents(e.lostCents)}</span>
            ) : (
              <span className="text-ink-400">{formatCents(e.potentialCents)}</span>
            )
          ) : (
            <>
              {formatCents(e.earnedCents)}
              <span className="text-ink-400"> / {formatCents(e.potentialCents)}</span>
            </>
          )}
        </p>
      </div>

      <div className="space-y-2">
        {weeks.map((w) => (
          <div key={w.start}>
            {weeks.length > 1 && (
              <p className="mb-1 text-xs text-ink-400">Week of {formatShortDate(w.start)}</p>
            )}
            {/* Seven columns whatever the expectation, so a day box and a
                numbered box are the same size and a week reads as a week. */}
            <div className="grid grid-cols-7 gap-1">
              {w.boxes.map((b) => (
                <BoxButton
                  key={b.key}
                  box={b}
                  weekEnd={w.end}
                  childId={childId}
                  expectation={e}
                  today={today}
                  onMiss={onMiss}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function BoxButton({
  box,
  weekEnd,
  childId,
  expectation: e,
  today,
  onMiss,
}: {
  box: Box;
  weekEnd: string;
  childId: string;
  expectation: ExpectationView;
  today: string;
  onMiss: (p: NotePrompt) => void;
}) {
  const [pending, startTransition] = useTransition();
  const checked = box.state === "met" || box.state === "done";
  const disabled = box.future || box.state === "excused" || pending;

  const tap = () =>
    startTransition(async () => {
      const { missId } = await tapBox({
        childId,
        responsibilityId: e.id,
        date: box.date,
        weekEnd: box.numbered ? weekEnd : undefined,
        checked,
      });
      if (missId) {
        const when = box.numbered
          ? today >= box.date && today <= weekEnd
            ? "today"
            : `week of ${formatShortDate(box.date)}`
          : formatShortDate(box.date);
        onMiss({ missId, title: e.name, when, note: "" });
      }
    });

  // The day letter or number is the box's label; its colour is the state.
  const look =
    box.state === "excused"
      ? "border-ink-200 bg-ink-100 text-ink-400 dark:border-ink-700 dark:bg-ink-700"
      : checked
        ? "border-ledger-600 bg-ledger-600 text-white"
        : box.state === "missed"
          ? "border-red-400 bg-red-50 text-red-300 dark:border-red-500 dark:bg-red-950/40 dark:text-red-400/60"
          : "border-ink-300 bg-white text-ink-400 dark:border-ink-600 dark:bg-ink-900";

  const verb = checked ? (e.payMode === "expected" ? "Mark missed" : "Uncheck") : "Check";
  const isToday = !box.numbered && box.date === today;
  return (
    <button
      type="button"
      onClick={tap}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={`${verb}: ${e.name}, ${box.numbered ? `#${box.label}` : box.date}`}
      title={box.note ?? undefined}
      className={`relative flex aspect-square w-full max-w-14 items-center justify-center rounded-lg border-2 text-base font-semibold transition disabled:cursor-default ${look} ${
        box.future ? "opacity-40" : ""
      } ${pending ? "opacity-60" : ""} ${isToday ? "ring-2 ring-ledger-500/40 ring-offset-1 dark:ring-offset-ink-800" : ""}`}
    >
      {box.label}
      {box.state === "missed" && (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="absolute inset-0 m-auto h-4/5 w-4/5 text-red-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        >
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      )}
      {box.note && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-ink-800" />
      )}
    </button>
  );
}

function MissNoteSheet({
  childId,
  prompt,
  onClose,
}: {
  childId: string;
  prompt: NotePrompt | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Sheet open={!!prompt} onClose={onClose} title="Add a note?">
      {prompt && (
        <form
          key={prompt.missId}
          onSubmit={(ev) => {
            ev.preventDefault();
            const note = String(new FormData(ev.currentTarget).get("note") ?? "");
            startTransition(async () => {
              await saveMissNote({ childId, missId: prompt.missId, note });
              onClose();
            });
          }}
          className="space-y-4"
        >
          <p className="text-sm text-ink-400">
            Missed <span className="font-medium text-ink-700 dark:text-ink-200">{prompt.title}</span>{" "}
            — {prompt.when}. Notes show up on this week&apos;s paycheck.
          </p>
          <Textarea
            name="note"
            rows={3}
            autoFocus
            defaultValue={prompt.note}
            placeholder="What happened (optional)"
            maxLength={500}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Skip
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

export { MissNoteSheet };
export type { NotePrompt };
