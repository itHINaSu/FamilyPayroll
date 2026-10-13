import Link from "next/link";

import { formatCents } from "@/lib/money";
import type { HistoryRow } from "@/lib/history";
import { ACCOUNT_LABELS } from "@/lib/transaction-kinds";
import { ChevronRightIcon } from "../../icons";

/**
 * One row per thing that happened. A paycheck opens its pay stub; a split
 * or paycheck shows how it was divided; a transfer shows where it went.
 */
export function HistoryList({
  rows,
  childId,
  timezone,
}: {
  rows: HistoryRow[];
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
    return <p className="text-sm text-ink-400">Nothing recorded yet.</p>;
  }

  return (
    <ul className="-my-1">
      {rows.map((row) => {
        const neutral = row.kind === "transfer" || row.kind === "goal";
        const where =
          row.kind === "transfer"
            ? `${ACCOUNT_LABELS[row.from!]} → ${ACCOUNT_LABELS[row.to!]}`
            : row.kind === "goal"
              ? "Savings"
              : row.parts.length === 1
                ? ACCOUNT_LABELS[row.parts[0].accountType]
                : "Split";
        const breakdown =
          row.parts.length > 1 && (row.kind === "split" || row.kind === "paycheck")
            ? row.parts
                .map((p) => `${ACCOUNT_LABELS[p.accountType]} ${formatCents(Math.abs(p.amountCents))}`)
                .join(" · ")
            : null;

        const body = (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{row.description}</p>
              <p className="text-xs text-ink-400">
                {formatDate(row.occurredAt)} · {where}
                {row.kind !== "paycheck" && row.kind !== "transfer" && ` · ${row.typeLabel}`}
                {row.actorName && ` · ${row.actorName}`}
              </p>
              {breakdown && <p className="text-xs text-ink-400">{breakdown}</p>}
              {row.memo && <p className="text-xs italic text-ink-400">{row.memo}</p>}
            </div>
            <span
              className={`tnum shrink-0 text-right text-sm ${
                neutral
                  ? "text-ink-400"
                  : row.amountCents < 0
                    ? "text-ink-700 dark:text-ink-200"
                    : "text-ledger-600 dark:text-ledger-500"
              }`}
            >
              {!neutral && row.amountCents > 0 ? "+" : ""}
              {formatCents(row.amountCents)}
            </span>
          </>
        );

        return (
          <li key={row.key} className="border-b border-ink-100 last:border-0 dark:border-ink-700">
            {row.kind === "paycheck" && row.paystubId ? (
              <Link
                href={`/balances/${childId}/stubs/${row.paystubId}`}
                className="flex items-start gap-3 py-3"
              >
                {body}
                <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 dark:text-ink-500" />
              </Link>
            ) : (
              <div className="flex items-start gap-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
