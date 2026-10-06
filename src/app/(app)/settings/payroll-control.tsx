"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card } from "@/components/ui";
import { togglePayroll, type PayrollState } from "./actions";
import { formatShortDate } from "@/lib/dates";

function Submit({ paused }: { paused: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={paused ? "primary" : "secondary"} disabled={pending}>
      {pending ? "Working…" : paused ? "Start payroll" : "Pause payroll"}
    </Button>
  );
}

export function PayrollControl({ pausedOn }: { pausedOn: string | null }) {
  const [state, formAction] = useActionState<PayrollState, FormData>(togglePayroll, {});
  const paused = pausedOn !== null;

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Payroll</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            paused
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "bg-ledger-100 text-ledger-600"
          }`}
        >
          {paused ? `Paused since ${formatShortDate(pausedOn!)}` : "Running"}
        </span>
      </div>
      <p className="mb-4 text-sm text-ink-400">
        {paused
          ? "Nothing is paid, billed, or earns interest. Chores can still be marked. Starting excuses the paused days, so nobody is docked for them, and nothing is back-paid or back-billed."
          : "Pausing stops pay, bills, and interest until you start again — for getting set up, or a stretch when life gets in the way. Unposted pay stubs and upcoming bills are cleared; nothing already paid changes."}
      </p>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="intent" value={paused ? "resume" : "pause"} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.message && <Alert tone="info">{state.message}</Alert>}
        <Submit paused={paused} />
      </form>
    </Card>
  );
}
