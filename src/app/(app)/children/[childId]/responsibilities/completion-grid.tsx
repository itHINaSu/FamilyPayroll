"use client";

import { formatCents } from "@/lib/money";
import { addOccurrence, archiveResponsibility, toggleCompletion } from "./actions";

export type GridRow = {
  id: string;
  name: string;
  cadence: string;
  cadenceLabel: string;
  weeklyValueCents: number;
  potentialCents: number;
  earnedCents: number;
  completed: number;
  chances: number;
  eligibleDates: string[];
  excusedDates: string[];
  doneDates: string[];
};

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export function CompletionGrid({
  childId,
  days,
  rows,
  today,
}: {
  childId: string;
  days: string[];
  rows: GridRow[];
  today: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-400">
            <th className="pb-2 text-left font-medium">Responsibility</th>
            {days.map((d) => {
              const weekday = new Date(`${d}T12:00:00`).getDay();
              return (
                <th key={d} className="w-9 pb-2 text-center font-medium">
                  <span className={d === today ? "text-ledger-600" : ""}>
                    {DAY_INITIALS[weekday]}
                  </span>
                </th>
              );
            })}
            <th className="pb-2 pl-3 text-right font-medium">Earned</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const eligible = new Set(row.eligibleDates);
            const excused = new Set(row.excusedDates);
            const done = new Set(row.doneDates);

            return (
              <tr
                key={row.id}
                className="border-t border-ink-100 dark:border-ink-700"
              >
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{row.name}</span>
                  <span className="block text-xs text-ink-400">
                    {row.cadenceLabel} · {formatCents(row.weeklyValueCents)}/week
                  </span>
                </td>

                {days.map((d) => {
                  const isExcused = excused.has(d);
                  const isEligible = eligible.has(d) && !isExcused;
                  const isDone = done.has(d);

                  if (isExcused) {
                    return (
                      <td key={d} className="text-center">
                        <span
                          className="inline-block h-7 w-7 rounded-md bg-ink-100 text-xs leading-7 text-ink-400 dark:bg-ink-700"
                          title="Excused — this lowers potential pay, not earnings"
                        >
                          –
                        </span>
                      </td>
                    );
                  }

                  if (!isEligible) {
                    return (
                      <td key={d} className="text-center text-ink-200 dark:text-ink-700">
                        ·
                      </td>
                    );
                  }

                  return (
                    <td key={d} className="text-center">
                      <form action={toggleCompletion} className="inline">
                        <input type="hidden" name="responsibilityId" value={row.id} />
                        <input type="hidden" name="childId" value={childId} />
                        <input type="hidden" name="date" value={d} />
                        <button
                          type="submit"
                          aria-label={`${row.name} on ${d}`}
                          className={`h-7 w-7 rounded-md border text-xs transition ${
                            isDone
                              ? "border-ledger-600 bg-ledger-600 text-white"
                              : "border-ink-300 hover:border-ledger-500 dark:border-ink-600"
                          }`}
                        >
                          {isDone ? "✓" : ""}
                        </button>
                      </form>
                    </td>
                  );
                })}

                <td className="tnum py-2.5 pl-3 text-right">
                  {formatCents(row.earnedCents)}
                  <span className="block text-xs text-ink-400">
                    of {formatCents(row.potentialCents)}
                  </span>
                </td>

                <td className="py-2.5 pl-2 text-right">
                  {row.cadence === "up_to_n" && (
                    <form action={addOccurrence} className="inline">
                      <input type="hidden" name="responsibilityId" value={row.id} />
                      <input type="hidden" name="childId" value={childId} />
                      <input type="hidden" name="date" value={today} />
                      <button
                        type="submit"
                        className="mr-2 text-xs text-ledger-600 hover:underline"
                        title="Record one more today"
                      >
                        +1
                      </button>
                    </form>
                  )}
                  <form action={archiveResponsibility} className="inline">
                    <input type="hidden" name="responsibilityId" value={row.id} />
                    <input type="hidden" name="childId" value={childId} />
                    <button
                      type="submit"
                      className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                    >
                      Archive
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
