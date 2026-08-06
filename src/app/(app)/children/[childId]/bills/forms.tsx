"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { addBill, collectNow, type BillState } from "./actions";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

export function CollectButton({
  instanceId,
  childId,
}: {
  instanceId: string;
  childId: string;
}) {
  return (
    <form action={collectNow} className="inline">
      <input type="hidden" name="instanceId" value={instanceId} />
      <input type="hidden" name="childId" value={childId} />
      <button
        type="submit"
        className="text-xs text-ledger-600 hover:underline"
        title="Collect now instead of waiting for the nightly run"
      >
        Collect
      </button>
    </form>
  );
}

export function AddBillForm({ childId }: { childId: string }) {
  const [state, formAction] = useActionState<BillState, FormData>(addBill, {});
  const [cadence, setCadence] = useState("monthly");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Add a bill</h2>
      <p className="mb-4 text-xs text-ink-400">
        Due whether or not a paycheck was earned. That is the whole point.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Bill added.</Alert>}

        <Field label="Name">
          <Input name="name" required placeholder="Rent" />
        </Field>

        <Field label="Amount">
          <Input name="amount" inputMode="decimal" placeholder="15.00" required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How often">
            <Select
              name="cadence"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>

          <Field label={cadence === "monthly" ? "Day of month" : "Weekday"}>
            {cadence === "monthly" ? (
              <Input name="dueDay" type="number" min={1} max={31} defaultValue={1} />
            ) : (
              <Select name="dueDay" defaultValue="1">
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

        <Field
          label="Where the money goes"
          hint="Parents only. This is never shown to the child or on the kiosk."
        >
          <Select name="disposition" defaultValue="held_for_child">
            <option value="held_for_child">Held secretly for them</option>
            <option value="disappears">Gone — a real expense</option>
            <option value="family_fund">Into a family fund</option>
          </Select>
        </Field>

        <Field label="Paid from">
          <Select name="sourceAccounts" defaultValue="checking">
            <option value="checking">Checking only</option>
            <option value="checking_savings">Checking, then Savings</option>
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autopay" defaultChecked />
          Collect automatically when due
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="mayUseEarmarked" className="mt-1" />
          <span>
            May take money earmarked for goals
            <span className="block text-xs text-ink-400">
              Off by default. A Lego fund draining to pay rent teaches that saving
              is pointless.
            </span>
          </span>
        </label>

        <Submit>Add bill</Submit>
      </form>
    </Card>
  );
}
