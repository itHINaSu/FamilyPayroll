import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { user, type AccountType } from "@/db/schema";
import { LEDGER_TYPE_LABELS, listLedger } from "@/lib/ledger";

/**
 * A child's ledger as a parent reads it: one row per thing that happened.
 *
 * The ledger stores one entry per account, so a paycheck is three entries, a
 * transfer two, and a split deposit one per account. Here they fold back into
 * a single row carrying its total and the per-account breakdown.
 */

export type HistoryPart = { accountType: AccountType; amountCents: number };

export type HistoryRow = {
  key: string;
  kind: "paycheck" | "transfer" | "goal" | "split" | "single";
  occurredAt: number;
  description: string;
  memo: string | null;
  typeLabel: string;
  actorName: string | null;
  /** Signed for money in or out; the amount moved for a transfer. */
  amountCents: number;
  parts: HistoryPart[];
  paystubId: string | null;
  from: AccountType | null;
  to: AccountType | null;
};

const ACCOUNT_ORDER: AccountType[] = ["checking", "savings", "generosity", "held"];

export function childHistory(childId: string, limit = 200): HistoryRow[] {
  const entries = listLedger(childId, limit);

  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const { entry } = e;
    const key =
      entry.type === "payroll_deposit" && entry.paystubId
        ? `stub:${entry.paystubId}`
        : entry.transferGroupId && entry.type !== "reversal"
          ? `grp:${entry.transferGroupId}`
          : entry.id;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const actorIds = [
    ...new Set(entries.map((e) => e.entry.actorUserId).filter((id): id is string => !!id)),
  ];
  const actorNames = new Map(
    actorIds.length
      ? db
          .select({ id: user.id, displayName: user.displayName })
          .from(user)
          .where(inArray(user.id, actorIds))
          .all()
          .map((u) => [u.id, u.displayName] as const)
      : [],
  );

  return [...groups.entries()].map(([key, legs]): HistoryRow => {
    const first = legs[0].entry;
    const parts = legs
      .map((l) => ({ accountType: l.accountType, amountCents: l.entry.amountCents }))
      .sort((a, b) => ACCOUNT_ORDER.indexOf(a.accountType) - ACCOUNT_ORDER.indexOf(b.accountType));
    const sum = parts.reduce((n, p) => n + p.amountCents, 0);
    const base = {
      key,
      occurredAt: first.occurredAt,
      description: first.description,
      memo: first.memo,
      typeLabel: LEDGER_TYPE_LABELS[first.type],
      actorName: first.actorUserId ? (actorNames.get(first.actorUserId) ?? null) : null,
      amountCents: sum,
      parts,
      paystubId: first.paystubId,
      from: null,
      to: null,
    };

    if (key.startsWith("stub:")) {
      return { ...base, kind: "paycheck", description: "Paycheck", typeLabel: "Payroll" };
    }

    const out = legs.find((l) => l.entry.type === "transfer_out");
    const into = legs.find((l) => l.entry.type === "transfer_in");
    if (out && into) {
      return {
        ...base,
        kind: "transfer",
        amountCents: into.entry.amountCents,
        from: out.accountType,
        to: into.accountType,
      };
    }

    const earmarked = legs.find((l) => l.entry.type === "earmark_in" || l.entry.type === "earmark_out");
    if (earmarked) {
      return {
        ...base,
        kind: "goal",
        amountCents: Math.abs(earmarked.entry.amountCents),
        typeLabel: "Goal",
      };
    }

    return { ...base, kind: legs.length > 1 ? "split" : "single" };
  });
}
