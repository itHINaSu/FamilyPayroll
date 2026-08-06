"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import type { AreaStatus } from "@/lib/trust";
import { addMark, saveFocusNote, setPin, undoMark, type TrustState } from "./actions";

const TONE_CLASSES: Record<string, string> = {
  green: "border-ledger-500 bg-ledger-100 text-ledger-600",
  amber: "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  orange: "border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  red: "border-red-400 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

/**
 * The recovery timeline is the point.
 *
 * "Back to Trusted by Thursday morning" is the same information as "3 marks",
 * expressed in the unit the lesson is actually about — and a seven-year-old
 * understands Thursday far better than they understand 3.
 */
function describeRecovery(clearsAt: number | null): string {
  if (!clearsAt) return "Clear";

  const hours = Math.max(0, (clearsAt - Date.now()) / 3_600_000);
  if (hours < 1) return "Clears within the hour";
  if (hours < 24) return `Clears in about ${Math.round(hours)} hours`;

  const when = new Date(clearsAt);
  const days = Math.ceil(hours / 24);
  const weekday = when.toLocaleDateString("en-US", { weekday: "long" });
  const period = when.getHours() < 12 ? "morning" : "evening";

  return days <= 6
    ? `Back to Trusted ${weekday} ${period}`
    : `Back to Trusted in about ${days} days`;
}

export function AreaCard({ area, childId }: { area: AreaStatus; childId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={`!p-4 border ${TONE_CLASSES[area.level.tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide opacity-70">{area.areaName}</p>
          <p className="text-lg font-semibold">{area.level.name}</p>
          <p className="mt-0.5 text-xs opacity-80">{describeRecovery(area.clearsAt)}</p>
          {area.pinned && (
            <p className="mt-1 text-xs font-medium">Set by hand · expires on its own</p>
          )}
        </div>

        <div className="text-right">
          {/* Parent-facing, so the raw load is shown here. What a CHILD sees is
              governed by trust.childVisibility and defaults to level only. */}
          <span className="tnum text-2xl font-semibold opacity-60">{area.load}</span>
          <span className="block text-xs opacity-60">of {area.capLoad}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-3 text-xs underline-offset-2 hover:underline"
      >
        {open ? "Hide" : "Set level by hand"}
      </button>

      {open && (
        <form action={setPin} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="trustAreaId" value={area.areaId} />
          <select
            name="level"
            defaultValue=""
            className="rounded border border-current/30 bg-white/60 px-2 py-1 text-xs dark:bg-black/20"
          >
            <option value="">Back to automatic</option>
            <option value="3">Trusted</option>
            <option value="2">Working on it</option>
            <option value="1">Not ready today</option>
            <option value="0">Taking a break</option>
          </select>
          <input
            type="number"
            name="expiresInHours"
            defaultValue={24}
            min={1}
            max={168}
            className="w-16 rounded border border-current/30 bg-white/60 px-2 py-1 text-xs dark:bg-black/20"
            title="Hours until it returns to automatic"
          />
          <button type="submit" className="text-xs font-medium underline">
            Apply
          </button>
        </form>
      )}
    </Card>
  );
}

export function MarkForm({
  childId,
  areas,
  rules,
}: {
  childId: string;
  areas: { id: string; name: string }[];
  rules: { id: string; text: string; weight: number; areaId: string }[];
}) {
  const [state, formAction] = useActionState<TrustState, FormData>(addMark, {});
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [ruleId, setRuleId] = useState("");

  const areaRules = rules.filter((r) => r.areaId === areaId);
  const selectedRule = areaRules.find((r) => r.id === ruleId);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Record something</h2>
      <p className="mb-4 text-xs text-ink-400">
        A positive weight is an infraction; a negative one is credit for putting
        something right. Credits speed up recovery but cannot be banked ahead.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Recorded.</Alert>}

        <Field label="Area">
          <Select
            name="trustAreaId"
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              setRuleId("");
            }}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="House rule" hint="Optional — or record something one-off.">
          <Select
            name="houseRuleId"
            value={ruleId}
            onChange={(e) => setRuleId(e.target.value)}
          >
            <option value="">Something else</option>
            {areaRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.text}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Weight">
          <Input
            name="weight"
            type="number"
            key={ruleId}
            defaultValue={selectedRule?.weight ?? 1}
            min={-10}
            max={10}
          />
        </Field>

        <Field label="Note">
          <Input name="note" placeholder="What actually happened" />
        </Field>

        <Submit>Record</Submit>
      </form>
    </Card>
  );
}

export function FocusNoteForm({
  childId,
  current,
}: {
  childId: string;
  current: string;
}) {
  const [state, formAction] = useActionState<TrustState, FormData>(
    saveFocusNote,
    {},
  );

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Today&apos;s focus</h2>
      <p className="mb-4 text-xs text-ink-400">
        One thing, never a list. A list of a child&apos;s failings on a screen is a
        shame board whatever the words are. Clears itself after a day.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Saved.</Alert>}

        <Field label="Working on">
          <Input
            name="text"
            defaultValue={current}
            placeholder="Listening the first time"
          />
        </Field>

        <Submit>Save</Submit>
      </form>
    </Card>
  );
}

export function MarkHistory({
  childId,
  marks,
}: {
  childId: string;
  marks: {
    id: string;
    weight: number;
    note: string | null;
    areaName: string;
    ruleText: string | null;
    occurredAt: number;
    retracted: boolean;
  }[];
}) {
  if (marks.length === 0) {
    return <p className="text-sm text-ink-400">Nothing recorded.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {marks.map((m) => (
        <li
          key={m.id}
          className={`flex items-start justify-between gap-3 border-b border-ink-100 pb-2.5 text-sm last:border-0 last:pb-0 dark:border-ink-700 ${
            m.retracted ? "opacity-40" : ""
          }`}
        >
          <div className="min-w-0">
            <p className={m.retracted ? "line-through" : ""}>
              {m.ruleText ?? m.note ?? "Recorded"}
            </p>
            <p className="text-xs text-ink-400">
              {m.areaName} ·{" "}
              {new Date(m.occurredAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
              {m.ruleText && m.note ? ` · ${m.note}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-3 whitespace-nowrap">
            <span
              className={`tnum text-sm ${
                m.weight > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-ledger-600 dark:text-ledger-500"
              }`}
            >
              {m.weight > 0 ? "+" : ""}
              {m.weight}
            </span>
            {!m.retracted && (
              <form action={undoMark}>
                <input type="hidden" name="markId" value={m.id} />
                <input type="hidden" name="childId" value={childId} />
                <button
                  type="submit"
                  className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                  title="Retract this mark entirely"
                >
                  Undo
                </button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
