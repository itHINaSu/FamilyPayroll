"use client";

import { useId, useState } from "react";

import { CheckField, FIELD_LABEL } from "@/components/ui";

const MODES = [
  {
    value: "expected",
    label: "Keep it",
    hint: "Starts the week paid. Each miss you mark docks their share.",
  },
  {
    value: "optional",
    label: "Earn it",
    hint: "Starts at $0. Each check-off earns its share.",
  },
] as const;

/**
 * How a responsibility pays — shared by every create and edit form so the
 * wording stays identical everywhere.
 */
export function PayModeFields({
  cadence,
  defaultPayMode = "expected",
  defaultAllOrNothing = false,
}: {
  cadence: string;
  defaultPayMode?: string;
  defaultAllOrNothing?: boolean;
}) {
  const labelId = useId();
  const [mode, setMode] = useState(defaultPayMode === "optional" ? "optional" : "expected");

  const current = MODES.find((m) => m.value === mode)!;

  return (
    <div className="space-y-3">
      <div>
        <span id={labelId} className={`mb-1.5 block ${FIELD_LABEL}`}>
          How it pays
        </span>
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="inline-flex rounded-lg bg-ink-100 p-1 dark:bg-ink-800"
        >
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === m.value
                  ? "bg-white text-ink-900 shadow-sm dark:bg-ink-600 dark:text-white"
                  : "text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
              }`}
            >
              <input
                type="radio"
                name="payMode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-400">{current.hint}</p>
      </div>

      <CheckField
        name="allOrNothing"
        defaultChecked={defaultAllOrNothing}
        label="All or nothing"
        hint={
          mode === "expected"
            ? "One miss in a week loses that whole week's pay for this."
            : "Pays only if every day in the week is checked off."
        }
      />
    </div>
  );
}
