"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { updateHousehold, type SettingsState } from "./actions";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function HouseholdForm({
  household,
}: {
  household: { name: string; timezone: string; appUrl: string; vapidContact: string };
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    updateHousehold,
    {},
  );

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">Family details</h2>

      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Saved.</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" defaultValue={household.name} required />
          </Field>

          <Field
            label="Timezone"
            hint="Pay periods, cutoffs, and bill due dates are all calculated here."
          >
            <Input name="timezone" defaultValue={household.timezone} required />
          </Field>

          <Field
            label="Public HTTPS URL"
            hint="Required before notifications work on iOS. Changing it invalidates every existing subscription."
          >
            <Input
              name="appUrl"
              defaultValue={household.appUrl}
              placeholder="https://payroll.example.com"
            />
          </Field>

          <Field
            label="Push contact"
            hint="A mailto: address or https:// URL. Apple validates this and rejects anything else."
          >
            <Input
              name="vapidContact"
              defaultValue={household.vapidContact}
              placeholder="mailto:you@example.com"
            />
          </Field>
        </div>

        <Save />
      </form>
    </Card>
  );
}
