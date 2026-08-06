"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { AGE_PRESETS, bandForAge } from "@/lib/age-presets";
import { addChild, type ChildFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Adding…" : "Add child"}
    </Button>
  );
}

function ageFromBirthdate(birthdate: string): number | null {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age--;
  return age;
}

export function AddChildForm({
  siblings = [],
}: {
  /** Existing children, for the "copy from" option. Omitted for the first child. */
  siblings?: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<ChildFormState, FormData>(
    addChild,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [birthdate, setBirthdate] = useState("");
  const [starterSetup, setStarterSetup] = useState<"preset" | "copy" | "blank">(
    "preset",
  );

  const age = useMemo(() => ageFromBirthdate(birthdate), [birthdate]);
  const band = age === null ? null : bandForAge(age);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setBirthdate("");
      setStarterSetup("preset");
    }
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-4 text-lg font-semibold">Add a child</h2>

      <form ref={formRef} action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Name">
          <Input name="displayName" required autoComplete="off" />
        </Field>

        <Field label="Birthdate" hint="Age is calculated from this, never stored.">
          <Input
            name="birthdate"
            type="date"
            required
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
          />
        </Field>

        <Field
          label="Status"
          hint="A newborn can be added now and start earning years later."
        >
          <Select name="status" defaultValue="active">
            <option value="active">Active — earning now</option>
            <option value="pre_participant">Not yet earning</option>
          </Select>
        </Field>

        <Field label="Photo" hint="Any size. It is resized automatically.">
          <Input name="photo" type="file" accept="image/*" />
        </Field>

        <Field
          label="Starting point"
          hint="Everything it adds is a normal row you can edit or delete afterward."
        >
          <Select
            name="starterSetup"
            value={starterSetup}
            onChange={(e) => setStarterSetup(e.target.value as typeof starterSetup)}
          >
            <option value="preset">
              Use an age preset{band ? ` — ${AGE_PRESETS[band].label}` : ""}
            </option>
            {siblings.length > 0 && <option value="copy">Copy a sibling&apos;s setup</option>}
            <option value="blank">Start blank</option>
          </Select>
        </Field>

        {starterSetup === "copy" && siblings.length > 0 && (
          <Field label="Copy from">
            <Select name="copyFromChildId" defaultValue={siblings[0].id}>
              {siblings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {starterSetup === "preset" && band && (
          <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-500 dark:bg-ink-700 dark:text-ink-300">
            Adds {AGE_PRESETS[band].responsibilities.length} responsibilities and
            matching trust settings for {AGE_PRESETS[band].label.toLowerCase()}.
          </p>
        )}

        <SubmitButton />
      </form>
    </Card>
  );
}
