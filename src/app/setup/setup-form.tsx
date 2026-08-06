"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { completeSetup, type SetupState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating…" : "Create household"}
    </Button>
  );
}

export function SetupForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [state, formAction] = useActionState<SetupState, FormData>(
    completeSetup,
    {},
  );

  return (
    <Card>
      <h2 className="text-lg font-semibold">Set up your household</h2>
      <p className="mt-1 mb-6 text-sm text-ink-400">
        This creates the household and your parent account. You can add your
        spouse and your children next.
      </p>

      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Household name">
          <Input name="householdName" required autoComplete="off" />
        </Field>

        <Field
          label="Timezone"
          hint="Pay periods, cutoff times, and bill due dates are all calculated in this timezone."
        >
          <Input name="timezone" defaultValue={defaultTimezone} required />
        </Field>

        <hr className="border-ink-200 dark:border-ink-700" />

        <Field label="Your name">
          <Input name="displayName" required autoComplete="name" />
        </Field>

        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>

        <Field label="Password" hint="At least 8 characters.">
          <Input
            name="password"
            type="password"
            required
            autoComplete="new-password"
          />
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
