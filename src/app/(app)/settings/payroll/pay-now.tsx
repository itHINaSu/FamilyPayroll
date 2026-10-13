"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Card } from "@/components/ui";
import { formatDateRange, formatShortDate } from "@/lib/dates";
import { draftNow, postNow, type PayState } from "./actions";

export type PayNowRow = {
  childId: string;
  name: string;
  startDate: string;
  endDate: string;
  payDate: string;
  draftStubId: string | null;
};

function Small({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-ink-200 disabled:opacity-50 dark:bg-ink-700 dark:text-ink-100"
    >
      {pending ? "…" : children}
    </button>
  );
}

function Row({ row }: { row: PayNowRow }) {
  const [draftState, draftAction] = useActionState<PayState, FormData>(draftNow, {});
  const [postState, postAction] = useActionState<PayState, FormData>(postNow, {});
  const error = draftState.error ?? postState.error;
  const ok = !error && (postState.ok ?? draftState.ok);

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{row.name}</p>
          <p className="text-xs text-ink-400">
            {formatDateRange(row.startDate, row.endDate)} · payday {formatShortDate(row.payDate)}
          </p>
        </div>
        <form action={draftAction}>
          <input type="hidden" name="childId" value={row.childId} />
          <input type="hidden" name="startDate" value={row.startDate} />
          <input type="hidden" name="endDate" value={row.endDate} />
          <input type="hidden" name="payDate" value={row.payDate} />
          <Small>Draft</Small>
        </form>
        {row.draftStubId && (
          <form action={postAction}>
            <input type="hidden" name="childId" value={row.childId} />
            <Small>Post</Small>
          </form>
        )}
      </div>
      {row.draftStubId && (
        <Link
          href={`/balances/${row.childId}/stubs/${row.draftStubId}`}
          className="mt-1 inline-block text-xs text-ledger-600 hover:underline dark:text-ledger-500"
        >
          See the waiting draft →
        </Link>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {ok && <p className="mt-1 text-xs text-ink-400">{ok}</p>}
    </li>
  );
}

/**
 * Draft this period early, or post a waiting draft before payday. Neither is
 * ever required — payroll does both on schedule.
 */
export function PayNow({ rows }: { rows: PayNowRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Run payroll early</h2>
      <p className="text-xs text-ink-400">
        Not needed — payroll drafts itself when a period closes and posts on payday. Use these
        to look early or pay early.
      </p>
      <ul className="divide-y divide-ink-100 dark:divide-ink-700">
        {rows.map((r) => (
          <Row key={r.childId} row={r} />
        ))}
      </ul>
    </Card>
  );
}
