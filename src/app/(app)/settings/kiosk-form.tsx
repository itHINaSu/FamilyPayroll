"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { createKiosk, revokeKiosk, type SettingsState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create a kiosk link"}
    </Button>
  );
}

export function KioskForm({
  devices,
}: {
  devices: { id: string; name: string; lastSeenAt: number | null }[];
}) {
  const [state, formAction] = useActionState<SettingsState & { url?: string }, FormData>(
    createKiosk,
    {},
  );

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Kiosk displays</h2>
      <p className="mb-4 text-sm text-ink-400">
        A link that pairs a screen permanently. Open it once on the wall tablet;
        it stays signed in and shows the family display. Nothing held for the
        future ever appears on the shared view.
      </p>

      {devices.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between border-b border-ink-100 pb-2 last:border-0 dark:border-ink-700"
            >
              <span>
                {d.name}
                <span className="ml-2 text-xs text-ink-400">
                  {d.lastSeenAt
                    ? `last seen ${new Date(d.lastSeenAt).toLocaleDateString()}`
                    : "never opened"}
                </span>
              </span>
              <form action={revokeKiosk}>
                <input type="hidden" name="deviceId" value={d.id} />
                <button
                  type="submit"
                  className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                >
                  Revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Name this screen">
            <Input name="name" placeholder="Kitchen tablet" />
          </Field>
        </div>
        <Submit />
      </form>

      {state.url && (
        <div className="mt-4">
          <Alert tone="info">
            <span className="block font-medium">Open this once on the display:</span>
            <code className="tnum mt-2 block break-all text-xs">{state.url}</code>
            <span className="mt-2 block text-xs">
              Shown once. Create another link if you lose it.
            </span>
          </Alert>
        </div>
      )}
    </Card>
  );
}
