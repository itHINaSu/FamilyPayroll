"use client";

import { Fragment, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

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
    <tr className="border-t border-ink-100 bg-ink-50 dark:border-ink-700 dark:bg-ink-900">
      <td colSpan={20} className="p-3">
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
                <option value="daily_selected">Certain days only</option>
                <option value="weekly">Once a week</option>
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
              className="text-xs text-ink-400 hover:text-ink-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

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
              <Fragment key={row.id}>
                <tr className="border-t border-ink-100 dark:border-ink-700">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{row.name}</span>
                    {row.fromTemplate && (
                      <span
                        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          row.customized
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                            : "bg-ink-100 text-ink-400 dark:bg-ink-700"
                        }`}
                      >
                        {row.customized ? "Customized" : "Family"}
                      </span>
                    )}
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

                  <td className="py-2.5 pl-2 text-right whitespace-nowrap">
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
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                      className="mr-2 text-xs text-ink-400 hover:text-ink-700 hover:underline"
                    >
                      Edit
                    </button>
                    <form action={archiveResponsibility} className="inline">
                      <input type="hidden" name="responsibilityId" value={row.id} />
                      <input type="hidden" name="childId" value={childId} />
                      <button
                        type="submit"
                        className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                      >
                        {row.fromTemplate ? "Turn off" : "Archive"}
                      </button>
                    </form>
                  </td>
                </tr>
                {editingId === row.id && (
                  <EditRow row={row} childId={childId} onDone={() => setEditingId(null)} />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
