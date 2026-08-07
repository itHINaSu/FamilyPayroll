"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { addExcusal, addResponsibility, applyRaise, type RespState } from "./actions";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function AddResponsibilityForm({
  childId,
  hasSiblings,
}: {
  childId: string;
  hasSiblings: boolean;
}) {
  const [state, formAction] = useActionState<RespState, FormData>(
    addResponsibility,
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
        State the value per week. The app divides it by how many chances the
        cadence gives, so a perfect week always pays exactly this amount.
        It also joins the family list, ready to switch on for a sibling
        later — but starts here, subscribed only to this child.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Added.</Alert>}

        <Field label="Name">
          <Input name="name" required placeholder="Make your bed" />
        </Field>

        <Field label="Weekly value">
          <Input name="weeklyValue" inputMode="decimal" placeholder="3.50" required />
        </Field>

        <Field label="How often">
          <Select
            name="cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
          >
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
                  <input type="checkbox" name="daysOfWeek" value={d.value} />
                  {d.label}
                </label>
              ))}
            </div>
          </Field>
        )}

        {cadence === "up_to_n" && (
          <Field
            label="Maximum per week"
            hint="Partial completion is expected here, so it reads as opportunity rather than a miss."
          >
            <Input
              name="maxOccurrences"
              type="number"
              min={1}
              max={21}
              defaultValue={3}
            />
          </Field>
        )}

        {hasSiblings && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="applyToAllChildren" className="mt-0.5" />
            <span>
              Apply to all children
              <span className="block text-xs text-ink-400">
                Otherwise it&apos;s added just for this child — turn it on for
                a sibling later from the family Responsibilities hub.
              </span>
            </span>
          </label>
        )}

        <Submit>Add responsibility</Submit>
      </form>
    </Card>
  );
}

export function RaiseForm({
  childId,
  responsibilities,
}: {
  childId: string;
  responsibilities: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<RespState, FormData>(applyRaise, {});
  const [scope, setScope] = useState<"all" | "selected">("all");

  if (responsibilities.length === 0) return null;

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Give a raise</h2>
      <p className="mb-4 text-xs text-ink-400">
        Recorded as a visible event. Note that most real raises are new
        responsibilities rather than a bigger number on the old ones.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Raise applied.</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select name="mode" defaultValue="percent">
              <option value="percent">Percent</option>
              <option value="fixed">Dollars</option>
            </Select>
          </Field>
          <Field label="Amount">
            <Input name="value" inputMode="decimal" defaultValue="5" required />
          </Field>
        </div>

        <Field label="Applies to">
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as "all" | "selected")}
          >
            <option value="all">Everything</option>
            <option value="selected">Only some</option>
          </Select>
        </Field>

        {scope === "selected" && (
          <div className="space-y-1.5">
            {responsibilities.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="responsibilityIds" value={r.id} />
                {r.name}
              </label>
            ))}
          </div>
        )}

        <Submit>Apply raise</Submit>
      </form>
    </Card>
  );
}

export function ExcusalForm({ childId }: { childId: string }) {
  const [state, formAction] = useActionState<RespState, FormData>(addExcusal, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Excuse some days</h2>
      <p className="mb-4 text-xs text-ink-400">
        Illness, holidays, a weekend away. Excused days lower potential pay
        rather than counting as missed, so a sick week never looks like a failed
        one.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Excused.</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Input name="startDate" type="date" required />
          </Field>
          <Field label="To">
            <Input name="endDate" type="date" required />
          </Field>
        </div>

        <Field label="Reason">
          <Input name="reason" placeholder="At grandma's" />
        </Field>

        <Submit>Excuse these days</Submit>
      </form>
    </Card>
  );
}
