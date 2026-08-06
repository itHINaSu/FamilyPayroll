"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" autoFocus />
        </Field>

        <Field label="Password">
          <Input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
