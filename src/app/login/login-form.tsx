"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { login, verifyMfaLogin, type LoginState, type MfaLoginState } from "./actions";

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Checking…" : children}
    </Button>
  );
}

function MfaStep() {
  const [state, formAction] = useActionState<MfaLoginState, FormData>(
    verifyMfaLogin,
    {},
  );

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <p className="text-sm text-ink-400">
          Enter the 6-digit code from your authenticator app, or one of your
          recovery codes.
        </p>
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="One-time code">
          <Input
            id="otp"
            name="otp"
            required
            autoComplete="one-time-code"
            autoFocus
            inputMode="text"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="123456"
          />
        </Field>

        <SubmitButton>Verify</SubmitButton>
      </form>
    </Card>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  if (state.mfaRequired) return <MfaStep />;

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Username">
          <Input name="email" type="text" required autoComplete="username" autoFocus />
        </Field>

        <Field label="Password">
          <Input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>

        <SubmitButton>Sign in</SubmitButton>
      </form>
    </Card>
  );
}
