"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { ChildCheckboxes } from "@/components/child-checkboxes";
import { PayModeFields } from "@/components/pay-mode-fields";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  addResponsibilityTemplate,
  archiveTemplate,
  editResponsibilityTemplate,
  setAppliesToNewChildren,
  toggleTemplateForChild,
  type TemplateState,
} from "./actions";
import {
  editResponsibility,
  resyncChildResponsibility,
  type RespState,
} from "./child-actions";

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
          <option value="daily_selected">Certain days (pick them)</option>
          <option value="weekly">Once a week, any day</option>
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

export function AddTemplateForm({ kids }: { kids: { id: string; name: string }[] }) {
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
      <h2 className="mb-1 text-lg font-semibold">Add an expectation</h2>
      <p className="mb-4 text-xs text-ink-400">
        Change it for one child afterward by clicking into it.
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

        <PayModeFields cadence={cadence} />
        <ChildCheckboxes kids={kids} />

        <Submit>Add expectation</Submit>
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
  row: {
    id: string;
    weeklyValueCents: number;
    cadence: string;
    daysOfWeek: number[] | null;
    maxOccurrences: number | null;
    payMode: string;
    allOrNothing: boolean;
  } | null;
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
    payMode: string;
    allOrNothing: boolean;
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
          </div>
          <PayModeFields
            key={cadence === "up_to_n" ? "n" : "d"}
            cadence={cadence}
            defaultPayMode={template.payMode}
            defaultAllOrNothing={template.allOrNothing}
          />
          <Submit small>Save</Submit>
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
    <ul className="space-y-2 text-sm">
      {statuses.map((s) => (
        <ChildRow key={s.childId} templateId={templateId} status={s} />
      ))}
    </ul>
  );
}

/** One child's line: on/off, and their own rate and schedule if needed. */
function ChildRow({ templateId, status: s }: { templateId: string; status: TemplateChildStatus }) {
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState(s.row?.cadence ?? "daily");
  const [state, formAction] = useActionState<RespState, FormData>(editResponsibility, {});

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          {s.childName}
          {s.enabled && s.customized && (
            <span className="block text-xs text-ink-400">
              Customized · {formatCents(s.weeklyValueCents ?? 0)}/week
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {s.enabled && s.row && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
            >
              {open ? "Close" : "Customize"}
            </button>
          )}
          <form action={toggleTemplateForChild}>
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="childId" value={s.childId} />
            <input type="hidden" name="enabled" value={String(s.enabled)} />
            <button
              type="submit"
              className={`min-w-12 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                s.enabled
                  ? "bg-ledger-100 text-ledger-600"
                  : "bg-ink-100 text-ink-400 dark:bg-ink-700"
              }`}
            >
              {s.enabled ? "On" : "Off"}
            </button>
          </form>
        </span>
      </div>

      {open && s.row && (
        <div className="mt-2 space-y-3 rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="responsibilityId" value={s.row.id} />
            <input type="hidden" name="childId" value={s.childId} />
            {state.error && <Alert>{state.error}</Alert>}
            <Field label="Weekly value">
              <Input
                name="weeklyValue"
                inputMode="decimal"
                defaultValue={(s.row.weeklyValueCents / 100).toFixed(2)}
                required
              />
            </Field>
            <CadenceFields
              cadence={cadence}
              setCadence={setCadence}
              defaultDays={s.row.daysOfWeek ?? undefined}
              defaultMax={s.row.maxOccurrences}
            />
            <PayModeFields
              cadence={cadence}
              defaultPayMode={s.row.payMode}
              defaultAllOrNothing={s.row.allOrNothing}
            />
            <Submit>{`Save for ${s.childName}`}</Submit>
          </form>
          {s.customized && (
            <form action={resyncChildResponsibility}>
              <input type="hidden" name="responsibilityId" value={s.row.id} />
              <input type="hidden" name="childId" value={s.childId} />
              <button type="submit" className="text-xs text-ledger-600 hover:underline">
                Use the family settings instead
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

/** Saves on tap — a single setting doesn't warrant a Save button. */
export function NewChildrenToggle({
  templateId,
  checked,
}: {
  templateId: string;
  checked: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setAppliesToNewChildren}>
      <input type="hidden" name="templateId" value={templateId} />
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="appliesToNewChildren"
          defaultChecked={checked}
          onChange={() => formRef.current?.requestSubmit()}
          className="mt-0.5"
        />
        <span>
          Add to new children automatically
          <span className="block text-xs text-ink-400">
            When you add a child later, they start with this expectation.
          </span>
        </span>
      </label>
    </form>
  );
}
