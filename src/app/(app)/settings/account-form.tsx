"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { updateAccount, type SettingsState } from "./actions";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function AccountForm({
  account,
}: {
  account: { displayName: string; email: string };
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    updateAccount,
    {},
  );

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Your account</h2>
      <p className="mb-4 text-sm text-ink-400">
        Your own login — not a child&apos;s. A current password is only needed
        when changing the username or password themselves.
      </p>

      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Saved.</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input name="displayName" defaultValue={account.displayName} required />
          </Field>

          <Field label="Username" hint="3-32 characters: letters, numbers, dots, underscores, hyphens.">
            <Input
              name="email"
              type="text"
              autoComplete="username"
              defaultValue={account.email}
              required
            />
          </Field>
        </div>

        <div className="border-t border-ink-100 pt-4 dark:border-ink-700">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-400">
            Change password (optional)
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Current password" hint="Required to change username or password.">
              <Input name="currentPassword" type="password" autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input name="newPassword" type="password" autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <Input name="confirmPassword" type="password" autoComplete="new-password" />
            </Field>
          </div>
        </div>

        <Save />
      </form>
    </Card>
  );
}
