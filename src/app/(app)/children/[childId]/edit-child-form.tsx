"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { FileInput } from "@/components/file-input";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { updateChild, type ChildFormState } from "../actions";
import type { ChildStatus } from "@/db/schema";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function EditChildForm({
  child,
}: {
  child: {
    id: string;
    displayName: string;
    birthdate: string;
    status: ChildStatus;
    photoBlobId: string | null;
  };
}) {
  const [state, formAction] = useActionState<ChildFormState, FormData>(
    updateChild,
    {},
  );

  return (
    <Card className="h-fit">
      <h2 className="mb-4 text-lg font-semibold">Edit</h2>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={child.id} />

        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Saved.</Alert>}

        <Field label="Name">
          <Input name="displayName" defaultValue={child.displayName} required />
        </Field>

        <Field label="Birthdate">
          <Input
            name="birthdate"
            type="date"
            defaultValue={child.birthdate}
            required
          />
        </Field>

        <Field label="Status">
          <Select name="status" defaultValue={child.status}>
            <option value="active">Active — earning now</option>
            <option value="pre_participant">Not yet earning</option>
            <option value="graduated">Graduated</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>

        <Field
          label="Photo"
          hint={
            child.photoBlobId
              ? "Uploading a new one replaces the current photo."
              : "Any size. It is resized automatically."
          }
        >
          <FileInput name="photo" accept="image/*" label="Choose photo" />
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
