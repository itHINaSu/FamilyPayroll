"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Input } from "@/components/ui";
import { backupNow, restoreBackup, type BackupState } from "./actions";

function BackupNowButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Backing up…" : "Back up now"}
    </Button>
  );
}

function RestoreButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={disabled || pending}>
      {pending ? "Restoring…" : "Restore this file"}
    </Button>
  );
}

export function BackupControls() {
  const [backupState, backupAction] = useActionState<BackupState, FormData>(
    backupNow,
    {},
  );
  const [restoreState, restoreAction] = useActionState<BackupState, FormData>(
    restoreBackup,
    {},
  );
  const [confirmed, setConfirmed] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const restoreFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (restoreState.ok) {
      restoreFormRef.current?.reset();
      setConfirmed(false);
      setHasFile(false);
    }
  }, [restoreState.ok]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-1 flex items-center justify-between gap-4">
          <h3 className="font-semibold">Back up now</h3>
        </div>
        <p className="mb-4 text-sm text-ink-400">
          Same consistent snapshot as the nightly one, taken on demand — before
          trying something you might want to undo, for instance.
        </p>
        <form action={backupAction}>
          {backupState.error && <Alert>{backupState.error}</Alert>}
          {backupState.ok && (
            <Alert tone="info">{backupState.message ?? "Saved."}</Alert>
          )}
          <div className="mt-3">
            <BackupNowButton />
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold">Restore from a backup file</h3>
        <p className="mb-4 text-sm text-ink-400">
          Replaces the entire database — every balance, completion, and pay
          stub — with whatever was in the uploaded file. A safety snapshot of
          what is currently running is always saved first, so this is never a
          one-way door. The app needs restarting afterward for the restored
          data to take effect.
        </p>

        <form ref={restoreFormRef} action={restoreAction} className="space-y-4">
          {restoreState.error && <Alert>{restoreState.error}</Alert>}
          {restoreState.ok && (
            <Alert tone="info">
              {restoreState.message ?? "Restored. Restart the app to finish."}
            </Alert>
          )}

          <Input
            name="file"
            type="file"
            accept=".db"
            required
            onChange={(e) => setHasFile(!!e.target.files?.length)}
          />

          <label className="flex items-start gap-2 text-sm text-ink-500 dark:text-ink-300">
            <input
              type="checkbox"
              name="confirmed"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I understand this replaces the current database and requires
            restarting the app.
          </label>

          <RestoreButton disabled={!confirmed || !hasFile} />
        </form>
      </Card>
    </div>
  );
}
