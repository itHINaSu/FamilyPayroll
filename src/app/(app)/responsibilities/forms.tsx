"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  addResponsibilityTemplate,
  archiveTemplate,
  editResponsibilityTemplate,
  toggleTemplateForChild,
  type TemplateState,
} from "./actions";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function Submit({ children, small }: { children: string; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className={small ? "!px-3 !py-1 text-xs" : "w-full"}
    >
      {pending ? "Saving…" : children}
    </Button>
  );
}

function CadenceFields({
  cadence,
  setCadence,
  defaultDays,
  defaultMax,
}: {
  cadence: string;
  setCadence: (v: string) => void;
  defaultDays?: number[];
  defaultMax?: number | null;
}) {
  return (
    <>
      <Field label="How often">
        <Select name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value)}>
          <option value="daily">Every day</option>
          <option value="daily_selected">Certain days only</option>
          <option value="weekly">Once a week</option>
          <option value="up_to_n">Up to N times a week</option>
        </Select>
      </Field>

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
                  defaultChecked={defaultDays?.includes(d.value)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </Field>
      )}

      {cadence === "up_to_n" && (
        <Field label="Maximum per week">
          <Input
            name="maxOccurrences"
            type="number"
            min={1}
            max={21}
            defaultValue={defaultMax ?? 3}
          />
        </Field>
      )}
    </>
  );
}

export function AddTemplateForm() {
  const [state, formAction] = useActionState<TemplateState, FormData>(
    addResponsibilityTemplate,
    {},
  );
  const [cadence, setCadence] = useState("daily");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Add a responsibility</h2>
      <p className="mb-4 text-xs text-ink-400">
        Applies to every child by default — click into it afterward to turn
        it off for one child if it shouldn&apos;t, or change their rate
        without touching anyone
        else&apos;s.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Added.</Alert>}

        <Field label="Name">
          <Input name="name" required placeholder="Make your bed" />
        </Field>

        <Field label="Weekly value">
          <Input name="weeklyValue" inputMode="decimal" placeholder="3.50" required />
        </Field>

        <CadenceFields cadence={cadence} setCadence={setCadence} />

        <Submit>Add responsibility</Submit>
      </form>
    </Card>
  );
}

export type TemplateChildStatus = {
  childId: string;
  childName: string;
  enabled: boolean;
  customized: boolean;
  weeklyValueCents: number | null;
};

/**
 * The hub's row for one responsibility: name, weekly pay, and cadence are
 * the fields that get changed all the time, so they're live inputs with no
 * "Edit" click needed to get to them. Per-child overrides are the rarer
 * move, so they live one click away on the template's own detail page
 * instead of competing for space here.
 */
export function TemplateCard({
  template,
  activeCount,
  totalChildren,
}: {
  template: {
    id: string;
    name: string;
    weeklyValueCents: number;
    cadence: string;
    daysOfWeek: number[] | null;
    maxOccurrences: number | null;
  };
  activeCount: number;
  totalChildren: number;
}) {
  const [cadence, setCadence] = useState(template.cadence);
  const [editState, editAction] = useActionState<TemplateState, FormData>(
    editResponsibilityTemplate,
    {},
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <form action={editAction} className="flex-1 space-y-3">
          <input type="hidden" name="templateId" value={template.id} />
          {editState.error && <Alert>{editState.error}</Alert>}

          <Input
            name="name"
            defaultValue={template.name}
            required
            className="!text-base font-semibold"
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <Field label="Weekly">
                <Input
                  name="weeklyValue"
                  inputMode="decimal"
                  defaultValue={(template.weeklyValueCents / 100).toFixed(2)}
                  required
                />
              </Field>
            </div>
            <div className="min-w-[10rem] flex-1">
              <CadenceFields
                cadence={cadence}
                setCadence={setCadence}
                defaultDays={template.daysOfWeek ?? undefined}
                defaultMax={template.maxOccurrences}
              />
            </div>
            <Submit small>Save</Submit>
          </div>
        </form>

        <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
          <Link
            href={`/responsibilities/${template.id}`}
            className="whitespace-nowrap text-xs text-ledger-600 hover:underline"
          >
            {activeCount}/{totalChildren} children →
          </Link>
          <form action={archiveTemplate}>
            <input type="hidden" name="templateId" value={template.id} />
            <button
              type="submit"
              className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
            >
              Remove
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}

/**
 * The detail page's per-child breakdown — moved out of the hub card so
 * enabling/disabling a template for one child takes a deliberate click into
 * the template rather than sitting in front of everyone on every visit.
 */
export function PerChildStatusList({
  templateId,
  statuses,
}: {
  templateId: string;
  statuses: TemplateChildStatus[];
}) {
  return (
    <ul className="space-y-1.5 text-sm">
      {statuses.map((s) => (
        <li key={s.childId} className="flex items-center justify-between gap-3">
          <span>{s.childName}</span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-ink-400">
              {!s.enabled
                ? "Off"
                : s.customized
                  ? `Customized · ${formatCents(s.weeklyValueCents ?? 0)}/week`
                  : "On"}
            </span>
            <form action={toggleTemplateForChild}>
              <input type="hidden" name="templateId" value={templateId} />
              <input type="hidden" name="childId" value={s.childId} />
              <input type="hidden" name="enabled" value={String(s.enabled)} />
              <button
                type="submit"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  s.enabled
                    ? "bg-ledger-100 text-ledger-600"
                    : "bg-ink-100 text-ink-400 dark:bg-ink-700"
                }`}
              >
                {s.enabled ? "On" : "Off"}
              </button>
            </form>
          </span>
        </li>
      ))}
    </ul>
  );
}
