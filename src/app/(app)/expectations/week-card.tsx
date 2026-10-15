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
import { MissedX, TODAY_RING, boxLook } from "./box-look";

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
    <Card>
      {!full && (
        <Link
          href={`/expectations/${child.id}`}
          className="-m-1 mb-3 flex items-center gap-3 rounded-lg p-1"
        >
          <Avatar name={child.name} photoBlobId={child.photoBlobId} size="sm" />
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
          <Link href="/settings/expectations" className="underline">
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
            <div className="grid grid-cols-7">
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

  const verb = checked ? (e.payMode === "expected" ? "Mark missed" : "Uncheck") : "Check";
  const isToday = !box.numbered && box.date === today;
  // A full 44px tap target around a smaller 36px box: easy to hit, lighter
  // to look at. The day letter or number is the label; its colour is the state.
  return (
    <button
      type="button"
      onClick={tap}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={`${verb}: ${e.name}, ${box.numbered ? `#${box.label}` : box.date}`}
      title={box.note ?? undefined}
      className="flex h-11 w-full items-center justify-center disabled:cursor-default"
    >
      <span
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border-2 text-sm font-semibold transition ${boxLook(box)} ${
          pending ? "opacity-60" : ""
        } ${isToday ? TODAY_RING : ""}`}
      >
        {box.label}
        {box.state === "missed" && <MissedX />}
        {box.note && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-ink-800" />
        )}
      </span>
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
