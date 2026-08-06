"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { addChild, type ChildFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Adding…" : "Add child"}
    </Button>
  );
}

export function AddChildForm() {
  const [state, formAction] = useActionState<ChildFormState, FormData>(
    addChild,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
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
          <Input name="birthdate" type="date" required />
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

        <SubmitButton />
      </form>
    </Card>
  );
}
