"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { ACCOUNT_LABELS } from "@/lib/transaction-kinds";
import type { AccountType, LedgerEntryType } from "@/db/schema";
import { reverseLedgerEntry, type LedgerFormState } from "./ledger-actions";

export type LedgerRow = {
  id: string;
  amountCents: number;
  type: LedgerEntryType;
  typeLabel: string;
  accountType: AccountType;
  description: string;
  memo: string | null;
  occurredAt: number;
  actorName: string | null;
  isReversed: boolean;
  isReversal: boolean;
};

function ReverseButton({ entryId, childId }: { entryId: string; childId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<LedgerFormState, FormData>(
    reverseLedgerEntry,
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline dark:hover:text-ink-100"
      >
        Reverse
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="childId" value={childId} />
      <input
        name="reason"
        placeholder="Reason (optional)"
        className="w-36 rounded border border-ink-300 px-2 py-1 text-xs dark:border-ink-600 dark:bg-ink-900"
      />
      <ConfirmReverse />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-ink-400 hover:text-ink-700"
      >
        Cancel
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function ConfirmReverse() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending} className="!px-2 !py-1 text-xs">
      {pending ? "…" : "Confirm"}
    </Button>
  );
}

export function LedgerTable({
  rows,
  childId,
  timezone,
}: {
  rows: LedgerRow[];
  childId: string;
  timezone: string;
}) {
  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    });

  if (rows.length === 0) {
    return (
      <Alert tone="info">
        Nothing recorded yet. Use the form to add cash, record a purchase, or move
        money between accounts.
      </Alert>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-700">
            <th className="pb-2 pr-3 font-medium">Date</th>
            <th className="pb-2 pr-3 font-medium">Description</th>
            <th className="pb-2 pr-3 font-medium">Account</th>
            <th className="pb-2 pr-3 text-right font-medium">Amount</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-ink-100 last:border-0 dark:border-ink-700 ${
                row.isReversed ? "opacity-50" : ""
              }`}
            >
              <td className="tnum whitespace-nowrap py-2.5 pr-3 text-ink-400">
                {formatDate(row.occurredAt)}
              </td>
              <td className="py-2.5 pr-3">
                <span className={row.isReversed ? "line-through" : ""}>
                  {row.description}
                </span>
                <span className="ml-2 text-xs text-ink-400">{row.typeLabel}</span>
                {row.memo && (
                  <span className="block text-xs text-ink-400">{row.memo}</span>
                )}
                {row.actorName && (
                  <span className="block text-xs text-ink-400">
                    by {row.actorName}
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-ink-500 dark:text-ink-300">
                {ACCOUNT_LABELS[row.accountType]}
              </td>
              <td
                className={`tnum whitespace-nowrap py-2.5 pr-3 text-right ${
                  row.amountCents < 0
                    ? "text-ink-700 dark:text-ink-200"
                    : "text-ledger-600 dark:text-ledger-500"
                }`}
              >
                {row.amountCents > 0 ? "+" : ""}
                {formatCents(row.amountCents)}
              </td>
              <td className="py-2.5 text-right">
                {/* A reversal is itself permanent, and something already
                    reversed has nothing left to undo. */}
                {!row.isReversal && !row.isReversed && (
                  <ReverseButton entryId={row.id} childId={childId} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
