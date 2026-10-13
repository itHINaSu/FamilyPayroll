"use client";

import { collectNow } from "./actions";

export function CollectButton({
  instanceId,
  childId,
}: {
  instanceId: string;
  childId: string;
}) {
  return (
    <form action={collectNow} className="inline">
      <input type="hidden" name="instanceId" value={instanceId} />
      <input type="hidden" name="childId" value={childId} />
      <button
        type="submit"
        className="text-xs text-ledger-600 hover:underline"
        title="Collect now instead of waiting for the nightly run"
      >
        Collect
      </button>
    </form>
  );
}
