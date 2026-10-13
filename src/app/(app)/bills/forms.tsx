"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  addBillTemplate,
  archiveTemplate,
  editBillTemplate,
  resyncBillForChild,
  setBillNewChildren,
  toggleBillTemplateForChild,
  type BillTemplateState,
} from "./actions";
import { editBill, type BillState } from "../children/[childId]/bills/actions";
import { ChildCheckboxes } from "@/components/child-checkboxes";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

function CadenceFields({
  cadence,
  setCadence,
  defaultDueDay,
}: {
  cadence: string;
  setCadence: (v: string) => void;
  defaultDueDay?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="How often">
        <Select name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value)}>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </Select>
      </Field>

      <Field label={cadence === "monthly" ? "Day of month" : "Weekday"}>
        {cadence === "monthly" ? (
          <Input name="dueDay" type="number" min={1} max={31} defaultValue={defaultDueDay ?? 1} />
        ) : (
          <Select name="dueDay" defaultValue={String(defaultDueDay ?? 1)}>
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
          </Select>
        )}
      </Field>
    </div>
  );
}

function DispositionFields({
  defaultDisposition,
  defaultSourceAccounts,
  defaultAutopay,
  defaultMayUseEarmarked,
}: {
  defaultDisposition?: string;
  defaultSourceAccounts?: string;
  defaultAutopay?: boolean;
  defaultMayUseEarmarked?: boolean;
}) {
  return (
    <>
      <Field
        label="Where the money goes"
        hint="Parents only. This is never shown to the child or on the kiosk."
      >
        <Select name="disposition" defaultValue={defaultDisposition ?? "held_for_child"}>
          <option value="held_for_child">Held secretly for them</option>
          <option value="disappears">Gone — a real expense</option>
          <option value="family_fund">Into a family fund</option>
        </Select>
      </Field>

      <Field label="Paid from">
        <Select name="sourceAccounts" defaultValue={defaultSourceAccounts ?? "checking"}>
          <option value="checking">Checking only</option>
          <option value="checking_savings">Checking, then Savings</option>
        </Select>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autopay" defaultChecked={defaultAutopay ?? true} />
        Collect automatically when due
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="mayUseEarmarked" className="mt-1" defaultChecked={defaultMayUseEarmarked} />
        <span>
          May take money earmarked for goals
          <span className="block text-xs text-ink-400">
            Off by default. A Lego fund draining to pay rent teaches that saving
            is pointless.
          </span>
        </span>
      </label>
    </>
  );
}

export function AddTemplateForm({ kids }: { kids: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<BillTemplateState, FormData>(addBillTemplate, {});
  const [cadence, setCadence] = useState("monthly");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Add a bill</h2>
      <p className="mb-4 text-xs text-ink-400">
        Change the amount for one child afterward from the bill&apos;s card.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Added.</Alert>}

        <Field label="Name">
          <Input name="name" required placeholder="Rent" />
        </Field>

        <Field label="Amount">
          <Input name="amount" inputMode="decimal" placeholder="15.00" required />
        </Field>

        <CadenceFields cadence={cadence} setCadence={setCadence} />
        <DispositionFields />
        <ChildCheckboxes kids={kids} />

        <Submit>Add bill</Submit>
      </form>
    </Card>
  );
}

export type TemplateChildStatus = {
  childId: string;
  childName: string;
  enabled: boolean;
  customized: boolean;
  amountCents: number | null;
  billId: string | null;
  cadence: string | null;
  dueDay: number | null;
};

export function TemplateCard({
  template,
  statuses,
}: {
  template: {
    id: string;
    name: string;
    amountCents: number;
    cadence: string;
    dueDay: number;
    disposition: string;
    sourceAccountOrder: string[];
    autopay: boolean;
    mayUseEarmarked: boolean;
    cadenceLabel: string;
    appliesToNewChildren: boolean;
  };
  statuses: TemplateChildStatus[];
}) {
  const [editing, setEditing] = useState(false);
  const [cadence, setCadence] = useState(template.cadence);
  const [editState, editAction] = useActionState<BillTemplateState, FormData>(
    editBillTemplate,
    {},
  );

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{template.name}</h3>
          <p className="text-xs text-ink-400">
            {formatCents(template.amountCents)} · {template.cadenceLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
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

      {editing && (
        <form
          action={editAction}
          className="mb-4 space-y-3 border-b border-ink-100 pb-4 dark:border-ink-700"
        >
          <input type="hidden" name="templateId" value={template.id} />
          {editState.error && <Alert>{editState.error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" defaultValue={template.name} required />
            </Field>
            <Field label="Amount">
              <Input
                name="amount"
                inputMode="decimal"
                defaultValue={(template.amountCents / 100).toFixed(2)}
                required
              />
            </Field>
          </div>
          <CadenceFields cadence={cadence} setCadence={setCadence} defaultDueDay={template.dueDay} />
          <DispositionFields
            defaultDisposition={template.disposition}
            defaultSourceAccounts={
              template.sourceAccountOrder.length > 1 ? "checking_savings" : "checking"
            }
            defaultAutopay={template.autopay}
            defaultMayUseEarmarked={template.mayUseEarmarked}
          />
          <p className="text-xs text-ink-400">
            Updates every child who hasn&apos;t been customized individually.
          </p>
          <Submit>Save changes</Submit>
        </form>
      )}

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Per child</p>
      <ul className="space-y-2 text-sm">
        {statuses.map((s) => (
          <BillChildRow key={s.childId} templateId={template.id} status={s} />
        ))}
      </ul>

      <form
        action={setBillNewChildren}
        className="mt-4 border-t border-ink-100 pt-3 dark:border-ink-700"
      >
        <input type="hidden" name="templateId" value={template.id} />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="appliesToNewChildren"
            defaultChecked={template.appliesToNewChildren}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
          Add to new children automatically
        </label>
      </form>
    </Card>
  );
}

/** One child's line on a bill: on/off, and a per-child amount if needed. */
function BillChildRow({ templateId, status: s }: { templateId: string; status: TemplateChildStatus }) {
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState(s.cadence ?? "monthly");
  const [state, formAction] = useActionState<BillState, FormData>(editBill, {});

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
              Customized · {formatCents(s.amountCents ?? 0)}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {s.enabled && s.billId && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
            >
              {open ? "Close" : "Customize"}
            </button>
          )}
          <form action={toggleBillTemplateForChild}>
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

      {open && s.billId && (
        <div className="mt-2 space-y-3 rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="billId" value={s.billId} />
            <input type="hidden" name="childId" value={s.childId} />
            {state.error && <Alert>{state.error}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <Input
                  name="amount"
                  inputMode="decimal"
                  defaultValue={((s.amountCents ?? 0) / 100).toFixed(2)}
                  required
                />
              </Field>
              <Field label="How often">
                <Select name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                </Select>
              </Field>
            </div>
            <Field label={cadence === "monthly" ? "Day of month" : "Weekday"}>
              {cadence === "monthly" ? (
                <Input name="dueDay" type="number" min={1} max={31} defaultValue={s.dueDay ?? 1} />
              ) : (
                <Select name="dueDay" defaultValue={String(s.dueDay ?? 5)}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                    (d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ),
                  )}
                </Select>
              )}
            </Field>
            <Submit>{`Save for ${s.childName}`}</Submit>
          </form>
          {s.customized && (
            <form action={resyncBillForChild}>
              <input type="hidden" name="billId" value={s.billId} />
              <input type="hidden" name="childId" value={s.childId} />
              <button type="submit" className="text-xs text-ledger-600 hover:underline">
                Use the family amount instead
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
