"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card } from "@/components/ui";
import {
  deactivateChildLogin,
  inviteChild,
  reactivateChildLogin,
  type ChildLoginState,
} from "./actions";

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Invite this child"}
    </Button>
  );
}

export function ChildLoginForm({
  childId,
  childName,
  existingLogin,
  hasPendingInvite,
}: {
  childId: string;
  childName: string;
  existingLogin: { id: string; email: string; active: boolean } | null;
  hasPendingInvite: boolean;
}) {
  const [state, formAction] = useActionState<ChildLoginState, FormData>(inviteChild, {});

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">{childName}&apos;s login</h2>
      <p className="mb-4 text-sm text-ink-400">
        Old enough to check their own balance and status directly, instead of
        over your shoulder. A personal login only ever shows a read-only view
        of their own account — no held funds, no bill amounts.
      </p>

      {existingLogin ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>
            @{existingLogin.email}
            {!existingLogin.active && (
              <span className="ml-2 text-xs text-ink-400">deactivated</span>
            )}
          </span>
          {existingLogin.active ? (
            <form action={deactivateChildLogin}>
              <input type="hidden" name="userId" value={existingLogin.id} />
              <input type="hidden" name="childId" value={childId} />
              <button
                type="submit"
                className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
              >
                Deactivate
              </button>
            </form>
          ) : (
            <form action={reactivateChildLogin}>
              <input type="hidden" name="userId" value={existingLogin.id} />
              <input type="hidden" name="childId" value={childId} />
              <button
                type="submit"
                className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
              >
                Reactivate
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          {state.error && <Alert>{state.error}</Alert>}
          <form action={formAction}>
            <input type="hidden" name="childId" value={childId} />
            <InviteButton />
          </form>

          {hasPendingInvite && !state.url && (
            <p className="mt-3 text-xs text-ink-400">
              An invite is already pending. Inviting again replaces it.
            </p>
          )}

          {state.url && (
            <div className="mt-4">
              <Alert tone="info">
                <span className="block font-medium">Send this to {childName}:</span>
                <code className="tnum mt-2 block break-all text-xs">{state.url}</code>
                <span className="mt-2 block text-xs">
                  Works once, for 7 days. Shown only this one time.
                </span>
              </Alert>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
