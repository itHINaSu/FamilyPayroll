"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { applyRaise, type RaiseState } from "./raise-actions";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

export function RaiseForm({
  childId,
  responsibilities,
}: {
  childId: string;
  responsibilities: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<RaiseState, FormData>(applyRaise, {});
  const [scope, setScope] = useState<"all" | "selected">("all");

  if (responsibilities.length === 0) return null;

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Give a raise</h2>
      <p className="mb-4 text-xs text-ink-400">
        Recorded as a visible event. Note that most real raises are new
        expectations rather than a bigger number on the old ones.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Raise applied.</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select name="mode" defaultValue="percent">
              <option value="percent">Percent</option>
              <option value="fixed">Dollars</option>
            </Select>
          </Field>
          <Field label="Amount">
            <Input name="value" inputMode="decimal" defaultValue="5" required />
          </Field>
        </div>

        <Field label="Applies to">
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as "all" | "selected")}
          >
            <option value="all">Everything</option>
            <option value="selected">Only some</option>
          </Select>
        </Field>

        {scope === "selected" && (
          <div className="space-y-1.5">
            {responsibilities.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="responsibilityIds" value={r.id} />
                {r.name}
              </label>
            ))}
          </div>
        )}

        <Submit>Apply raise</Submit>
      </form>
    </Card>
  );
}

