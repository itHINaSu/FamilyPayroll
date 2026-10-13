"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { resetHistoryAction, type PayrollState } from "./actions";

const OPTIONS = [
  {
    name: "money",
    label: "Balances and payroll history",
    detail:
      "Every account to $0.00; all transactions, pay stubs, bill payments, interest, and pending money requests.",
  },
  {
    name: "chores",
    label: "Expectation marks",
    detail: "Every marked miss, check-off, and excused day — this pay period starts fresh.",
  },
  {
    name: "jobs",
    label: "Extra-job claims",
    detail: "Claimed, submitted, and approved jobs. The jobs on offer stay.",
  },
] as const;

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={disabled || pending}>
      {pending ? "Clearing…" : "Clear selected"}
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
  const [picked, setPicked] = useState<Record<string, boolean>>({ money: true });
  const [state, formAction] = useActionState<PayrollState, FormData>(resetHistoryAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-400 hover:text-red-600 hover:underline"
      >
        Reset history…
      </button>
    );
  }

  const anyPicked = Object.values(picked).some(Boolean);

  return (
    <Card className="!border-red-300 dark:!border-red-900">
      <h2 className="mb-1 text-lg font-semibold text-red-700 dark:text-red-400">Reset history</h2>
      <p className="mb-4 text-sm text-ink-400">
        Clears what you tick. Parents, children, expectations, bills, jobs,
        goals, and settings are always kept. A backup is saved
        first, so it can be restored from the Backups section.
      </p>

      {state.message ? (
        <Alert tone="info">{state.message}</Alert>
      ) : (
        <form action={formAction} className="space-y-4">
          {state.error && <Alert>{state.error}</Alert>}

          <fieldset className="space-y-3">
            {OPTIONS.map((o) => (
              <label key={o.name} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name={o.name}
                  checked={!!picked[o.name]}
                  onChange={(e) => setPicked({ ...picked, [o.name]: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  {o.label}
                  <span className="block text-xs text-ink-400">{o.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>

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
            <Submit disabled={!anyPicked || confirmText.trim() !== "RESET"} />
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
