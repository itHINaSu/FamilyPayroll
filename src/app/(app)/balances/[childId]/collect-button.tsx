"use client";

import { useFormStatus } from "react-dom";

import { collectNow } from "../actions";

function Label() {
  const { pending } = useFormStatus();
  return <>{pending ? "…" : "Collect"}</>;
}

/** Take a bill now instead of waiting for the nightly run. Never overdraws. */
export function CollectButton({ instanceId, childId }: { instanceId: string; childId: string }) {
  return (
    <form action={collectNow}>
      <input type="hidden" name="instanceId" value={instanceId} />
      <input type="hidden" name="childId" value={childId} />
      <button
        type="submit"
        className="text-xs font-medium text-ledger-600 hover:underline dark:text-ledger-500"
        title="Collect now instead of waiting for the nightly run"
      >
        <Label />
      </button>
    </form>
  );
}
