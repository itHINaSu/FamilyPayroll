"use client";

import { useState } from "react";

import { formatShortDate } from "@/lib/dates";
import { MissNoteSheet, type NotePrompt } from "../week-card";

/** Every miss this period, each with its note — tap one to add or edit it. */
export function MissList({
  childId,
  misses,
}: {
  childId: string;
  misses: { id: string; name: string; date: string; note: string | null }[];
}) {
  const [prompt, setPrompt] = useState<NotePrompt | null>(null);

  return (
    <>
      <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-700">
        {misses.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() =>
                setPrompt({
                  missId: m.id,
                  title: m.name,
                  when: formatShortDate(m.date),
                  note: m.note ?? "",
                })
              }
              className="flex w-full items-start justify-between gap-3 py-2.5 text-left"
            >
              <span className="min-w-0">
                {m.name}
                <span className="block text-xs text-ink-400">
                  {m.note ? `“${m.note}”` : "No note — tap to add one"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-ink-400">{formatShortDate(m.date)}</span>
            </button>
          </li>
        ))}
      </ul>
      <MissNoteSheet childId={childId} prompt={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}
