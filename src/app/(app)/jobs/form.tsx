"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { addJob, editJob, type JobState } from "./actions";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

type JobDefaults = {
  name?: string;
  description?: string | null;
  value?: number;
  repeatRule?: string;
  repeatN?: number | null;
  limitScope?: string;
  limitCount?: number;
  claimExpiryHours?: number;
  allocationMode?: string;
  eligibleChildIds?: string[] | null;
  trustAreaId?: string | null;
  minTrustLevel?: number | null;
};

/** The full field set, shared between posting a new job and editing one. */
function JobFields({
  children,
  areas,
  defaults,
}: {
  children: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  defaults?: JobDefaults;
}) {
  const [repeatRule, setRepeatRule] = useState(defaults?.repeatRule ?? "weekly");
  const [gated, setGated] = useState(!!defaults?.trustAreaId);
  const eligibleSet = new Set(defaults?.eligibleChildIds ?? []);

  return (
    <>
      <Field label="Job">
        <Input name="name" required placeholder="Wash the car" defaultValue={defaults?.name} />
      </Field>

      <Field label="Details">
        <Input
          name="description"
          placeholder="Inside and out, including the wheels"
          defaultValue={defaults?.description ?? ""}
        />
      </Field>

      <Field label="Pays">
        <Input
          name="value"
          inputMode="decimal"
          placeholder="5.00"
          required
          defaultValue={defaults?.value !== undefined ? (defaults.value / 100).toFixed(2) : undefined}
        />
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
            <Input name="repeatN" type="number" min={1} defaultValue={defaults?.repeatN ?? 3} />
          </Field>
        ) : (
          <Field label="Times per period">
            <Input
              name="limitCount"
              type="number"
              min={1}
              defaultValue={defaults?.limitCount ?? 1}
            />
          </Field>
        )}
      </div>

      <Field
        label="The limit counts"
        hint="Per child means both children can each take it. Total means first come, first served."
      >
        <Select name="limitScope" defaultValue={defaults?.limitScope ?? "per_child"}>
          <option value="per_child">Per child</option>
          <option value="global">Across everyone</option>
        </Select>
      </Field>

      <Field label="Who can take it" hint="Leave all unticked to offer it to everyone.">
        <div className="space-y-1.5">
          {children.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="eligibleChildIds"
                value={c.id}
                defaultChecked={eligibleSet.has(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Pay goes to">
        <Select name="allocationMode" defaultValue={defaults?.allocationMode ?? "inherit"}>
          <option value="inherit">Split like normal pay</option>
          <option value="checking_only">Straight to Checking</option>
        </Select>
      </Field>

      <Field label="Claim expires after (hours)">
        <Input
          name="claimExpiryHours"
          type="number"
          min={1}
          defaultValue={defaults?.claimExpiryHours ?? 48}
        />
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
              <Select name="trustAreaId" defaultValue={defaults?.trustAreaId ?? areas[0]?.id ?? ""}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="At least">
              <Select name="minTrustLevel" defaultValue={String(defaults?.minTrustLevel ?? 3)}>
                <option value="3">Trusted</option>
                <option value="2">Working on it</option>
                <option value="1">Not ready today</option>
              </Select>
            </Field>
          </div>
        )}
      </div>
    </>
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

        <JobFields children={children} areas={areas} />

        <Submit>Post job</Submit>
      </form>
    </Card>
  );
}

export function EditJobRow({
  job,
  children,
  areas,
  onDone,
}: {
  job: JobDefaults & { id: string };
  children: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<JobState, FormData>(editJob, {});

  return (
    <div className="mt-3 rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="jobId" value={job.id} />
        {state.error && <Alert>{state.error}</Alert>}

        <JobFields children={children} areas={areas} defaults={job} />

        <div className="flex items-center gap-3">
          <Submit>Save</Submit>
          <button type="button" onClick={onDone} className="text-xs text-ink-400 hover:text-ink-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
