"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { acceptInvite, type AcceptInviteState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating…" : "Create your login"}
    </Button>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AcceptInviteState, FormData>(
    acceptInvite,
    {},
  );

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Your name">
          <Input name="displayName" required autoComplete="name" autoFocus />
        </Field>

        <Field label="Username" hint="3-32 characters. What you'll log in with.">
          <Input name="username" required autoComplete="username" />
        </Field>

        <Field label="Password" hint="At least 8 characters.">
          <Input
            name="password"
            type="password"
            required
            autoComplete="new-password"
          />
        </Field>

        <Submit />
      </form>
    </Card>
  );
}
