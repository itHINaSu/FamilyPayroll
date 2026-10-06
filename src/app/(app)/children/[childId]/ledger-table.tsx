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
        className="justify-self-end text-xs text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline dark:hover:text-ink-100"
      >
        Reverse
      </button>
    );
  }

  return (
    <form action={formAction} className="col-span-2 mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="childId" value={childId} />
      <input
        name="reason"
        placeholder="Reason (optional)"
        className="min-w-0 flex-1 rounded border border-ink-300 px-2 py-1.5 text-base sm:text-sm dark:border-ink-600 dark:bg-ink-900"
      />
      <ConfirmReverse />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-ink-400 hover:text-ink-700"
      >
        Cancel
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function ConfirmReverse() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending} className="!px-3 !py-1.5 text-sm">
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
  const thisYear = new Date().getFullYear();
  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: new Date(ms).getFullYear() === thisYear ? undefined : "numeric",
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

  // A stacked list, not a table: five columns can't share a phone's width.
  return (
    <ul>
      {rows.map((row) => (
        <li
          key={row.id}
          className={`grid grid-cols-[1fr_auto] items-start gap-x-3 border-b border-ink-100 py-3 last:border-0 dark:border-ink-700 ${
            row.isReversed ? "opacity-50" : ""
          }`}
        >
          <div className="row-span-2 min-w-0">
            <p className={`text-sm ${row.isReversed ? "line-through" : ""}`}>
              {row.description}
            </p>
            <p className="text-xs text-ink-400">
              {formatDate(row.occurredAt)} · {ACCOUNT_LABELS[row.accountType]} ·{" "}
              {row.typeLabel}
              {row.actorName && <> · by {row.actorName}</>}
            </p>
            {row.memo && <p className="text-xs text-ink-400">{row.memo}</p>}
          </div>
          <span
            className={`tnum text-right text-sm ${
              row.amountCents < 0
                ? "text-ink-700 dark:text-ink-200"
                : "text-ledger-600 dark:text-ledger-500"
            }`}
          >
            {row.amountCents > 0 ? "+" : ""}
            {formatCents(row.amountCents)}
          </span>
          {/* A reversal is itself permanent, and something already reversed
              has nothing left to undo. */}
          {!row.isReversal && !row.isReversed && (
            <ReverseButton entryId={row.id} childId={childId} />
          )}
        </li>
      ))}
    </ul>
  );
}
