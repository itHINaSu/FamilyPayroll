"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Avatar } from "@/components/avatar";
import { Alert, Button, Card } from "@/components/ui";
import { ChevronRightIcon } from "../icons";
import { AddChildForm, AddChildToggle } from "./family/add-child-form";
import { RestoreButton } from "./family/row-actions";
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
  photoBlobId: string | null;
  /** "11 years old · Active" */
  detail: string;
  login: { id: string; username: string; active: boolean } | null;
  invitePending: boolean;
};

/**
 * The household's children: each opens their own page (profile, raise, pay
 * rules), and their login is managed right here. Adding a child and
 * restoring an archived one live here too.
 */
export function ChildrenCard({
  kids,
  archived,
}: {
  kids: ChildRow[];
  archived: { id: string; name: string }[];
}) {
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Children</h2>
      <p className="mb-2 text-sm text-ink-400">
        Tap a child for their profile, a raise, or their own pay rules. A child&apos;s
        login only ever shows a read-only view of their own account.
      </p>

      {kids.length === 0 ? (
        <AddChildForm siblings={[]} bare />
      ) : (
        <>
          <ul className="divide-y divide-ink-100 dark:divide-ink-700">
            {kids.map((k) => (
              <ChildRowItem key={k.id} kid={k} />
            ))}
          </ul>
          <div className="mt-3">
            <AddChildToggle siblings={kids.map((k) => ({ id: k.id, name: k.name }))} bare />
          </div>
        </>
      )}

      {archived.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-3 dark:border-ink-700">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Archived</p>
          <ul className="divide-y divide-ink-100 dark:divide-ink-700">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {a.name}
                  <span className="ml-2 text-xs text-ink-400">history kept</span>
                </span>
                <RestoreButton childId={a.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ChildRowItem({ kid }: { kid: ChildRow }) {
  const [state, formAction] = useActionState<ChildLoginState, FormData>(inviteChild, {});

  return (
    <li className="py-3">
      <Link href={`/settings/family/${kid.id}`} className="flex items-center gap-3">
        <Avatar name={kid.name} photoBlobId={kid.photoBlobId} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{kid.name}</span>
          <span className="block truncate text-xs text-ink-400">{kid.detail}</span>
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-300 dark:text-ink-500" />
      </Link>

      <div className="mt-1.5 flex items-center justify-between gap-3 pl-11 text-xs text-ink-400">
        <span className="min-w-0 truncate">
          {kid.login
            ? `Login @${kid.login.username}${kid.login.active ? "" : " · deactivated"}`
            : kid.invitePending && !state.url
              ? "Invite pending — inviting again replaces it"
              : "No login"}
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

/**
 * The parents' logins. There is no email sending, so an invite is a link you
 * hand over directly — text it, AirDrop it, whatever is easiest.
 */
export function ParentsCard({
  parents,
  parentInvites,
  selfId,
}: {
  parents: UserRow[];
  parentInvites: { id: string; expiresAt: number }[];
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
      <h2 className="mb-1 text-lg font-semibold">Parents</h2>
      <p className="mb-2 text-sm text-ink-400">
        Invites are links you hand over directly — text them, AirDrop them, whatever is
        easiest.
      </p>

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
    </Card>
  );
}
