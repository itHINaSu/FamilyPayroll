"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { addJob, type JobState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Post job"}
    </Button>
  );
}

export function AddJobForm({
  children,
  areas,
}: {
  children: { id: string; name: string }[];
  areas: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<JobState, FormData>(addJob, {});
  const [repeatRule, setRepeatRule] = useState("weekly");
  const [gated, setGated] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-4 text-lg font-semibold">Post a job</h2>

      <form ref={formRef} action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Posted.</Alert>}

        <Field label="Job">
          <Input name="name" required placeholder="Wash the car" />
        </Field>

        <Field label="Details">
          <Input name="description" placeholder="Inside and out, including the wheels" />
        </Field>

        <Field label="Pays">
          <Input name="value" inputMode="decimal" placeholder="5.00" required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeats">
            <Select
              name="repeatRule"
              value={repeatRule}
              onChange={(e) => setRepeatRule(e.target.value)}
            >
              <option value="once">Once only</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="every_n_days">Every N days</option>
            </Select>
          </Field>

          {repeatRule === "every_n_days" ? (
            <Field label="Days">
              <Input name="repeatN" type="number" min={1} defaultValue={3} />
            </Field>
          ) : (
            <Field label="Times per period">
              <Input name="limitCount" type="number" min={1} defaultValue={1} />
            </Field>
          )}
        </div>

        <Field
          label="The limit counts"
          hint="Per child means both children can each take it. Total means first come, first served."
        >
          <Select name="limitScope" defaultValue="per_child">
            <option value="per_child">Per child</option>
            <option value="global">Across everyone</option>
          </Select>
        </Field>

        <Field label="Who can take it" hint="Leave all unticked to offer it to everyone.">
          <div className="space-y-1.5">
            {children.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="eligibleChildIds" value={c.id} />
                {c.name}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Pay goes to">
          <Select name="allocationMode" defaultValue="inherit">
            <option value="inherit">Split like normal pay</option>
            <option value="checking_only">Straight to Checking</option>
          </Select>
        </Field>

        <Field label="Claim expires after (hours)">
          <Input name="claimExpiryHours" type="number" min={1} defaultValue={48} />
        </Field>

        <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={gated}
              onChange={(e) => setGated(e.target.checked)}
              className="mt-1"
            />
            <span>
              Require a trust level
              <span className="block text-xs text-ink-400">
                Blocks claiming only. It can never reduce pay for work already
                done — you do not get promoted if you are not trustworthy, but you
                still get paid for last week.
              </span>
            </span>
          </label>

          {gated && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Area">
                <Select name="trustAreaId" defaultValue={areas[0]?.id ?? ""}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="At least">
                <Select name="minTrustLevel" defaultValue="3">
                  <option value="3">Trusted</option>
                  <option value="2">Working on it</option>
                  <option value="1">Not ready today</option>
                </Select>
              </Field>
            </div>
          )}
        </div>

        <Submit />
      </form>
    </Card>
  );
}
