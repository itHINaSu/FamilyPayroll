"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { resetApp, type SettingsState } from "./actions";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={disabled || pending}>
      {pending ? "Erasing…" : "Erase everything"}
    </Button>
  );
}

/**
 * Deliberately buried: a plain text link at the very bottom of Settings that
 * only reveals the real form when clicked. Almost no household should ever
 * need this.
 */
export function ResetControl() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [state, formAction] = useActionState<SettingsState, FormData>(resetApp, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-400 hover:text-red-600 hover:underline"
      >
        Reset the app…
      </button>
    );
  }

  return (
    <Card className="!border-red-300 dark:!border-red-900">
      <h2 className="mb-1 text-lg font-semibold text-red-700 dark:text-red-400">Reset the app</h2>
      <p className="mb-4 text-sm text-ink-400">
        Erases everything — every parent login, child, balance, pay stub, and
        history — and returns to the first-run setup. A backup snapshot is saved
        first, so it can still be restored from the Backups section afterward.
      </p>

      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Type RESET to confirm">
          <Input
            name="confirmText"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </Field>
        <Field label="Your current password">
          <Input name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>

        <div className="flex items-center gap-3">
          <Submit disabled={confirmText.trim() !== "RESET"} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-ink-400 hover:text-ink-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
