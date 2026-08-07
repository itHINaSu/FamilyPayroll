"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input } from "@/components/ui";
import {
  confirmMfaEnrollment,
  disableMfa,
  startMfaEnrollment,
  type MfaConfirmState,
  type MfaEnrollState,
  type SettingsState,
} from "./actions";

function Submit({ children, variant }: { children: string; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

function EnabledView() {
  const [state, formAction] = useActionState<SettingsState, FormData>(disableMfa, {});

  return (
    <Card>
      <h3 className="mb-1 font-semibold">Two-factor authentication</h3>
      <p className="mb-4 text-sm text-ink-400">
        On. Signing in needs a code from your authenticator app (or a recovery
        code) after the password.
      </p>

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        {state.error && (
          <div className="w-full">
            <Alert>{state.error}</Alert>
          </div>
        )}
        <div className="flex-1">
          <Field label="Current password" hint="Required to turn this off.">
            <Input name="currentPassword" type="password" autoComplete="current-password" />
          </Field>
        </div>
        <Submit variant="danger">Turn off</Submit>
      </form>
    </Card>
  );
}

function EnrollStep({ onDone }: { onDone: () => void }) {
  const [startState, startAction] = useActionState<MfaEnrollState, FormData>(
    startMfaEnrollment,
    {},
  );
  const [confirmState, confirmAction] = useActionState<MfaConfirmState, FormData>(
    confirmMfaEnrollment,
    {},
  );

  if (confirmState.recoveryCodes) {
    return (
      <Card>
        <h3 className="mb-1 font-semibold">Save these recovery codes</h3>
        <p className="mb-4 text-sm text-ink-400">
          Each works once, if the authenticator app is ever unavailable — a
          lost or reset phone, most often. Shown only this one time.
        </p>
        <ul className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-ink-50 p-3 font-mono text-sm dark:bg-ink-900">
          {confirmState.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button type="button" onClick={onDone}>
          I saved these
        </Button>
      </Card>
    );
  }

  if (!startState.secret) {
    return (
      <Card>
        <h3 className="mb-1 font-semibold">Two-factor authentication</h3>
        <p className="mb-4 text-sm text-ink-400">
          Off. Add a code from an authenticator app as a second step at sign
          in.
        </p>
        <form action={startAction}>
          {startState.error && <Alert>{startState.error}</Alert>}
          <Submit>Set up two-factor authentication</Submit>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="mb-1 font-semibold">Scan or enter this secret</h3>
      <p className="mb-3 text-sm text-ink-400">
        In your authenticator app (Google Authenticator, Authy, 1Password, and
        similar all work), add an account and enter this secret by hand —
        no camera needed.
      </p>
      <p className="mb-4 rounded-lg bg-ink-50 p-3 text-center font-mono text-lg tracking-wider dark:bg-ink-900">
        {startState.secretDisplay}
      </p>

      <form action={confirmAction} className="space-y-3">
        <input type="hidden" name="secret" value={startState.secret} />
        {confirmState.error && <Alert>{confirmState.error}</Alert>}
        <Field label="Code from the app" hint="Confirms the secret was entered correctly.">
          <Input name="code" required autoComplete="one-time-code" autoFocus />
        </Field>
        <Submit>Turn on</Submit>
      </form>
    </Card>
  );
}

export function MfaForm({ enabled }: { enabled: boolean }) {
  const [justEnabled, setJustEnabled] = useState(false);

  if (enabled || justEnabled) return <EnabledView />;
  return <EnrollStep onDone={() => setJustEnabled(true)} />;
}
