"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { resetBalances, type PayrollState } from "./actions";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={disabled || pending}>
      {pending ? "Resetting…" : "Reset balances"}
    </Button>
  );
}

/**
 * Deliberately buried: a plain text link at the very bottom of Settings that
 * only reveals the real form when clicked.
 */
export function ResetControl() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [state, formAction] = useActionState<PayrollState, FormData>(resetBalances, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-400 hover:text-red-600 hover:underline"
      >
        Reset balances and payroll history…
      </button>
    );
  }

  return (
    <Card className="!border-red-300 dark:!border-red-900">
      <h2 className="mb-1 text-lg font-semibold text-red-700 dark:text-red-400">
        Reset balances and payroll history
      </h2>
      <p className="mb-4 text-sm text-ink-400">
        Sets every account to $0.00 and clears all pay stubs, transactions,
        bill payments, interest, and pending money requests. Parents, children,
        responsibilities, bills, jobs, goals, trust, and settings are kept.
        Pay periods that already ended are not paid again. A backup is saved
        first, so it can be restored from the Backups section.
      </p>

      {state.message ? (
        <Alert tone="info">{state.message}</Alert>
      ) : (
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
      )}
    </Card>
  );
}
