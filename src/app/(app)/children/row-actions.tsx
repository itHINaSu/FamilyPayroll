"use client";

import { Button } from "@/components/ui";
import { archiveChild, restoreChild } from "./actions";

/**
 * The bottom of a child's Setup page. Archiving is a once-in-a-lifetime
 * event, so it's a plain text action behind a confirmation, not a button
 * anywhere a child gets picked.
 */
export function ArchiveButton({ childId, name }: { childId: string; name: string }) {
  return (
    <form
      action={archiveChild}
      onSubmit={(event) => {
        if (
          !confirm(
            `Archive ${name}? They disappear from every tab and stop being paid. ` +
              "Their history is kept, and you can restore them from Setup › Children.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="childId" value={childId} />
      <button
        type="submit"
        className="tap text-sm text-red-600 hover:underline dark:text-red-400"
      >
        Archive {name}
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
