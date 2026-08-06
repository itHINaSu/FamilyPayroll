"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button } from "@/components/ui";
import { draftNow, postNow, type PayState } from "./actions";

function ActionButton({
  children,
  variant = "secondary",
}: {
  children: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function PayrollControls({
  childId,
  startDate,
  endDate,
  payDate,
}: {
  childId: string;
  startDate: string;
  endDate: string;
  payDate: string;
}) {
  const [draftState, draftAction] = useActionState<PayState, FormData>(draftNow, {});
  const [postState, postAction] = useActionState<PayState, FormData>(postNow, {});

  const message = draftState.error ?? postState.error ?? draftState.ok ?? postState.ok;
  const isError = !!(draftState.error ?? postState.error);

  return (
    <div className="space-y-3">
      {message && <Alert tone={isError ? "error" : "info"}>{message}</Alert>}

      <div className="flex flex-wrap gap-2">
        <form action={draftAction}>
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="startDate" value={startDate} />
          <input type="hidden" name="endDate" value={endDate} />
          <input type="hidden" name="payDate" value={payDate} />
          <ActionButton>Draft this period now</ActionButton>
        </form>

        <form action={postAction}>
          <input type="hidden" name="childId" value={childId} />
          <ActionButton variant="primary">Post the waiting draft</ActionButton>
        </form>
      </div>

      <p className="text-xs text-ink-400">
        Neither of these is necessary. Payroll drafts itself when the period
        closes and posts itself on payday — these are here for when you want to
        look early or pay early.
      </p>
    </div>
  );
}
