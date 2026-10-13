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
import {
  deactivateChildLogin,
  inviteChild,
  reactivateChildLogin,
  type ChildLoginState,
} from "./child-login-actions";

function Submit({ idle, busy, variant }: { idle: string; busy: string; variant?: "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className={variant ? "!px-3 !py-1.5 text-xs" : ""}>
      {pending ? busy : idle}
    </Button>
  );
}

function LinkToSend({ who, url }: { who: string; url: string }) {
  return (
    <div className="mt-3">
      <Alert tone="info">
        <span className="block font-medium">Send this to {who}:</span>
        <code className="tnum mt-2 block break-all text-xs">{url}</code>
        <span className="mt-2 block text-xs">Works once, for 7 days. Shown only this one time.</span>
      </Alert>
    </div>
  );
}

function ToggleLogin({
  active,
  userId,
  onDeactivate,
  onReactivate,
}: {
  active: boolean;
  userId: string;
  onDeactivate: (formData: FormData) => void;
  onReactivate: (formData: FormData) => void;
}) {
  return (
    <form action={active ? onDeactivate : onReactivate}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="text-xs text-ink-400 hover:text-ink-700 hover:underline">
        {active ? "Deactivate" : "Reactivate"}
      </button>
    </form>
  );
}

export type UserRow = { id: string; displayName: string; username: string; active: boolean };
export type ChildRow = {
  id: string;
  name: string;
  login: { id: string; username: string; active: boolean } | null;
  invitePending: boolean;
};

/**
 * Every login on the household — parents and children — in one place.
 * There is no email sending, so an invite is a link you hand over directly.
 */
export function UsersForm({
  parents,
  parentInvites,
  kids,
  selfId,
}: {
  parents: UserRow[];
  parentInvites: { id: string; expiresAt: number }[];
  kids: ChildRow[];
  selfId: string;
}) {
  const [inviteState, inviteAction] = useActionState<SettingsState & { url?: string }, FormData>(
    inviteParent,
    {},
  );
  const [deactivateState, deactivateAction] = useActionState<SettingsState, FormData>(
    deactivateParent,
    {},
  );

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Users</h2>
      <p className="mb-4 text-sm text-ink-400">
        Invites are links you hand over directly — text them, AirDrop them, whatever is
        easiest. A child&apos;s login only ever shows a read-only view of their own account.
      </p>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Parents</p>
      <ul className="mb-3 divide-y divide-ink-100 text-sm dark:divide-ink-700">
        {parents.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              {p.displayName}
              <span className="block text-xs text-ink-400">
                @{p.username}
                {p.id === selfId && " · you"}
                {!p.active && " · deactivated"}
              </span>
            </span>
            {p.id !== selfId && (
              <ToggleLogin
                active={p.active}
                userId={p.id}
                onDeactivate={deactivateAction}
                onReactivate={reactivateParent}
              />
            )}
          </li>
        ))}
      </ul>
      {deactivateState.error && <Alert>{deactivateState.error}</Alert>}

      {parentInvites.length > 0 && (
        <ul className="mb-3 space-y-1.5 text-sm">
          {parentInvites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3">
              <span className="text-ink-500 dark:text-ink-300">
                Parent invite · expires {new Date(i.expiresAt).toLocaleDateString()}
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
      )}

      <form action={inviteAction}>
        {inviteState.error && <Alert>{inviteState.error}</Alert>}
        <Submit idle="Invite a parent" busy="Creating…" />
      </form>
      {inviteState.url && <LinkToSend who="the other parent" url={inviteState.url} />}

      {kids.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-ink-400">
            Children
          </p>
          <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-700">
            {kids.map((k) => (
              <ChildLoginRow key={k.id} kid={k} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function ChildLoginRow({ kid }: { kid: ChildRow }) {
  const [state, formAction] = useActionState<ChildLoginState, FormData>(inviteChild, {});

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          {kid.name}
          <span className="block text-xs text-ink-400">
            {kid.login
              ? `@${kid.login.username}${kid.login.active ? "" : " · deactivated"}`
              : kid.invitePending && !state.url
                ? "Invite pending — inviting again replaces it"
                : "No login"}
          </span>
        </span>
        {kid.login ? (
          <ToggleLogin
            active={kid.login.active}
            userId={kid.login.id}
            onDeactivate={deactivateChildLogin}
            onReactivate={reactivateChildLogin}
          />
        ) : (
          <form action={formAction}>
            <input type="hidden" name="childId" value={kid.id} />
            <Submit idle="Invite" busy="…" variant="secondary" />
          </form>
        )}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.url && <LinkToSend who={kid.name} url={state.url} />}
    </li>
  );
}
