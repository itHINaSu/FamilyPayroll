"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { PayModeFields } from "@/components/pay-mode-fields";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  addOccurrence,
  archiveResponsibility,
  editResponsibility,
  toggleCompletion,
  type RespState,
} from "./actions";

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
  missedDates: string[];
  missed: number;
  payMode: "expected" | "optional";
  allOrNothing: boolean;
  toEarnCents: number;
  lostCents: number;
  daysOfWeek: number[] | null;
  maxOccurrences: number | null;
  fromTemplate: boolean;
  customized: boolean;
};

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

function EditRow({ row, childId, onDone }: { row: GridRow; childId: string; onDone: () => void }) {
  const [state, formAction] = useActionState<RespState, FormData>(editResponsibility, {});
  const [cadence, setCadence] = useState(row.cadence);

  return (
    <div className="mt-3 rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="responsibilityId" value={row.id} />
          <input type="hidden" name="childId" value={childId} />
          {state.error && <Alert>{state.error}</Alert>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Weekly value">
              <Input
                name="weeklyValue"
                inputMode="decimal"
                defaultValue={(row.weeklyValueCents / 100).toFixed(2)}
                required
              />
            </Field>

            <Field label="How often">
              <Select name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value)}>
                <option value="daily">Every day</option>
                <option value="daily_selected">Certain days (pick them)</option>
                <option value="weekly">Once a week, any day</option>
                <option value="up_to_n">Up to N times a week</option>
              </Select>
            </Field>

            {cadence === "up_to_n" && (
              <Field label="Maximum per week">
                <Input
                  name="maxOccurrences"
                  type="number"
                  min={1}
                  max={21}
                  defaultValue={row.maxOccurrences ?? 3}
                />
              </Field>
            )}
          </div>

          {cadence === "daily_selected" && (
            <Field label="Which days">
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <label
                    key={d.value}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-ink-300 px-2 py-1 text-xs dark:border-ink-600"
                  >
                    <input
                      type="checkbox"
                      name="daysOfWeek"
                      value={d.value}
                      defaultChecked={row.daysOfWeek?.includes(d.value)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </Field>
          )}

          <PayModeFields
            key={cadence === "up_to_n" ? "n" : "d"}
            cadence={cadence}
            defaultPayMode={row.payMode}
            defaultAllOrNothing={row.allOrNothing}
          />

          {row.fromTemplate && (
            <p className="text-xs text-ink-400">
              This is a family responsibility. Saving here changes only{" "}
              {row.name.toLowerCase()} for this child — everyone else keeps
              following the family rate.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Submit>Save</Submit>
            <button
              type="button"
              onClick={onDone}
              className="text-sm text-ink-400 hover:text-ink-700"
            >
              Cancel
            </button>
          </div>
        </form>
    </div>
  );
}

/**
 * One stacked block per responsibility rather than a table: name and
 * earnings on top, then a full-width row of seven day boxes. A table with a
 * name column, seven day columns, earnings and actions can't fit a phone.
 */
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
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      {rows.some((r) => r.payMode === "expected") && (
        <p className="mb-3 text-xs text-ink-400">
          Keep-it days start checked — tap one to mark a miss. Earn-it days start
          empty — tap to check off.
        </p>
      )}
      <div className="grid grid-cols-7 gap-1.5 pb-2 text-center text-xs font-medium text-ink-400 sm:max-w-sm">
        {days.map((d) => (
          <span key={d} className={d === today ? "text-ledger-600 dark:text-ledger-500" : ""}>
            {DAY_INITIALS[new Date(`${d}T12:00:00`).getDay()]}
          </span>
        ))}
      </div>

      {rows.map((row) => {
        const eligible = new Set(row.eligibleDates);
        const excused = new Set(row.excusedDates);
        const done = new Set(row.doneDates);
        const missed = new Set(row.missedDates);
        const expected = row.payMode === "expected";
        // Weekly is once on any day: after one day in a week is marked, the
        // rest of that week has nothing left to mark.
        const weekOf = (d: string) => Math.floor(days.indexOf(d) / 7);
        const markedWeeks = new Set(
          (expected ? row.missedDates : row.doneDates).map(weekOf),
        );
        const markedDays = new Set(expected ? row.missedDates : row.doneDates);

        return (
          <div key={row.id} className="border-t border-ink-100 py-3 dark:border-ink-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {row.name}
                  {row.fromTemplate && (
                    <span
                      className={`ml-1.5 whitespace-nowrap rounded-full px-1.5 py-0.5 align-middle text-[10px] font-medium ${
                        row.customized
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                          : "bg-ink-100 text-ink-400 dark:bg-ink-700"
                      }`}
                    >
                      {row.customized ? "Customized" : "Family"}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-400">
                  {row.cadenceLabel} · {formatCents(row.weeklyValueCents)}/week ·{" "}
                  {expected ? "Keep it" : "Earn it"}
                  {row.allOrNothing && " · All or nothing"}
                </p>
              </div>
              <p className="tnum shrink-0 text-right text-sm">
                {formatCents(row.earnedCents)}
                <span className="block text-xs text-ink-400">
                  of {formatCents(row.potentialCents)}
                </span>
              </p>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1.5 sm:max-w-sm">
              {days.map((d) => {
                const isExcused = excused.has(d);
                const isEligible = eligible.has(d) && !isExcused;
                const isDone = done.has(d);
                const isMissed = missed.has(d);

                if (isExcused) {
                  return (
                    <span
                      key={d}
                      className="flex h-10 items-center justify-center rounded-md bg-ink-100 text-xs text-ink-400 dark:bg-ink-700"
                      title="Excused — counts as done, never costs pay"
                    >
                      –
                    </span>
                  );
                }

                const settledByAnotherDay =
                  row.cadence === "weekly" && markedWeeks.has(weekOf(d)) && !markedDays.has(d);

                if (!isEligible || settledByAnotherDay) {
                  return (
                    <span
                      key={d}
                      className="flex h-10 items-center justify-center text-ink-200 dark:text-ink-700"
                    >
                      ·
                    </span>
                  );
                }

                const todayRing = d === today ? "ring-2 ring-ledger-500/40" : "";
                const look = expected
                  ? isMissed
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-ledger-100 bg-ledger-100 text-ledger-600 dark:border-ledger-600/40 dark:bg-ledger-600/20 dark:text-ledger-500"
                  : isDone
                    ? "border-ledger-600 bg-ledger-600 text-white"
                    : "border-ink-300 hover:border-ledger-500 dark:border-ink-600";
                const label = expected
                  ? isMissed
                    ? `Undo miss: ${row.name} on ${d}`
                    : `Mark ${row.name} missed on ${d}`
                  : `${row.name} on ${d}`;

                return (
                  <form key={d} action={toggleCompletion}>
                    <input type="hidden" name="responsibilityId" value={row.id} />
                    <input type="hidden" name="childId" value={childId} />
                    <input type="hidden" name="date" value={d} />
                    <button
                      type="submit"
                      aria-label={label}
                      title={label}
                      className={`h-10 w-full rounded-md border text-sm transition ${look} ${todayRing}`}
                    >
                      {expected ? (isMissed ? "✕" : "✓") : isDone ? "✓" : ""}
                    </button>
                  </form>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-4">
              {row.cadence === "up_to_n" && (
                <form action={addOccurrence}>
                  <input type="hidden" name="responsibilityId" value={row.id} />
                  <input type="hidden" name="childId" value={childId} />
                  <input type="hidden" name="date" value={today} />
                  <button
                    type="submit"
                    className="text-xs text-ledger-600 hover:underline"
                    title="Record one more today"
                  >
                    +1 today
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
              >
                Edit
              </button>
              <form action={archiveResponsibility}>
                <input type="hidden" name="responsibilityId" value={row.id} />
                <input type="hidden" name="childId" value={childId} />
                <button
                  type="submit"
                  className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                >
                  {row.fromTemplate ? "Turn off" : "Archive"}
                </button>
              </form>
            </div>

            {editingId === row.id && (
              <EditRow row={row} childId={childId} onDone={() => setEditingId(null)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
