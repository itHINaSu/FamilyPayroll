"use client";

import { Button } from "@/components/ui";
import { archiveChild, restoreChild } from "./actions";

export function ArchiveButton({
  childId,
  name,
}: {
  childId: string;
  name: string;
}) {
  return (
    <form
      action={archiveChild}
      onSubmit={(event) => {
        // Archiving is reversible and keeps every ledger entry, so the prompt is
        // a speed bump rather than a warning.
        if (
          !confirm(
            `Archive ${name}? Their history is kept and they can be restored at any time.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="childId" value={childId} />
      {/*
        A once-in-a-while action (mainly useful during initial setup)
        stays a plain text link rather than a full button, so it doesn't
        compete with the balance for attention on every visit.
      */}
      <button
        type="submit"
        className="text-xs text-ink-400 hover:text-ink-700 hover:underline dark:hover:text-ink-200"
      >
        Archive
      </button>
    </form>
  );
}

export function RestoreButton({ childId }: { childId: string }) {
  return (
    <form action={restoreChild}>
      <input type="hidden" name="childId" value={childId} />
      <Button type="submit" variant="secondary" className="!px-3 !py-1 text-xs">
        Restore
      </Button>
    </form>
  );
}
