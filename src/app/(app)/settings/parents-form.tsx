"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card } from "@/components/ui";
import {
  cancelInvite,
  deactivateParent,
  inviteParent,
  reactivateParent,
  type SettingsState,
} from "./actions";

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Invite a parent"}
    </Button>
  );
}

export function ParentsForm({
  parents,
  invites,
  selfId,
}: {
  parents: { id: string; displayName: string; email: string; active: boolean }[];
  invites: { id: string; createdAt: number; expiresAt: number }[];
  selfId: string;
}) {
  const [inviteState, inviteAction] = useActionState<
    SettingsState & { url?: string },
    FormData
  >(inviteParent, {});
  const [deactivateState, deactivateAction] = useActionState<SettingsState, FormData>(
    deactivateParent,
    {},
  );

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Parents</h2>
      <p className="mb-4 text-sm text-ink-400">
        Every parent login on this household. There is no email sending here,
        so an invite is a link you hand over directly — text it, AirDrop it,
        whatever is easiest.
      </p>

      <ul className="mb-4 space-y-2 text-sm">
        {parents.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2 last:border-0 dark:border-ink-700"
          >
            <span>
              {p.displayName}
              <span className="ml-2 text-xs text-ink-400">
                @{p.email}
                {p.id === selfId && " · you"}
                {!p.active && " · deactivated"}
              </span>
            </span>
            {p.id !== selfId &&
              (p.active ? (
                <form action={deactivateAction}>
                  <input type="hidden" name="userId" value={p.id} />
                  <button
                    type="submit"
                    className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                  >
                    Deactivate
                  </button>
                </form>
              ) : (
                <form action={reactivateParent}>
                  <input type="hidden" name="userId" value={p.id} />
                  <button
                    type="submit"
                    className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                  >
                    Reactivate
                  </button>
                </form>
              ))}
          </li>
        ))}
      </ul>

      {deactivateState.error && <Alert>{deactivateState.error}</Alert>}

      {invites.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
            Pending invites
          </p>
          <ul className="space-y-1.5 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between">
                <span className="text-ink-500 dark:text-ink-300">
                  Expires {new Date(i.expiresAt).toLocaleDateString()}
                </span>
                <form action={cancelInvite}>
                  <input type="hidden" name="inviteId" value={i.id} />
                  <button
                    type="submit"
                    className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                  >
                    Cancel
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={inviteAction}>
        {inviteState.error && <Alert>{inviteState.error}</Alert>}
        <InviteButton />
      </form>

      {inviteState.url && (
        <div className="mt-4">
          <Alert tone="info">
            <span className="block font-medium">Send this to the other parent:</span>
            <code className="tnum mt-2 block break-all text-xs">{inviteState.url}</code>
            <span className="mt-2 block text-xs">
              Works once, for 7 days. Shown only this one time.
            </span>
          </Alert>
        </div>
      )}
    </Card>
  );
}
