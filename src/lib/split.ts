import type { AccountType } from "@/db/schema";

/**
 * Splitting one income or expense across a child's accounts.
 *
 * Shared by the transaction form (for the live "Remaining" line) and the
 * server action (which re-derives the parts from what was typed and never
 * trusts the browser's arithmetic). Pure, so it is tested directly.
 */

export type SplitMode = "amount" | "percent";
export type SplitRow = { account: AccountType; value: string };
export type SplitPart = { accountType: AccountType; amountCents: number };

/** "33.33" → 3333 basis points; null for anything that isn't 0–100 with ≤2 decimals. */
export function parsePercentToBp(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const bp = Math.round(Number(cleaned) * 100);
  return bp > 10_000 ? null : bp;
}

/** "$4.50" → 450; null if it isn't a non-negative dollar figure. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  return Math.round(Number(cleaned) * 100);
}

/**
 * Turn the split rows into exact parts that sum to `totalCents`.
 *
 * Percent rows must total 100%. Each takes its floor and every leftover cent
 * goes to `remainderAccount` — the same rule payroll uses — or to the first
 * row when that account isn't part of this split. Dollar rows must add up to
 * the total exactly. Rows left at zero are dropped.
 */
export function resolveSplit(
  totalCents: number,
  mode: SplitMode,
  rows: SplitRow[],
  remainderAccount: AccountType,
): { parts: SplitPart[] } | { error: string } {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return { error: "Enter the total amount first." };
  }
  const used = rows.filter((r) => r.value.trim() !== "");
  if (used.length < 2) return { error: "A split needs at least two accounts." };
  if (new Set(used.map((r) => r.account)).size !== used.length) {
    return { error: "Each account can only appear once in a split." };
  }

  let parts: SplitPart[];

  if (mode === "percent") {
    const bps = used.map((r) => parsePercentToBp(r.value));
    if (bps.some((bp) => bp === null)) return { error: "Each percentage must be 0–100." };
    const totalBp = (bps as number[]).reduce((a, b) => a + b, 0);
    if (totalBp !== 10_000) {
      return { error: `The percentages add up to ${totalBp / 100}%, not 100%.` };
    }
    parts = used.map((r, i) => ({
      accountType: r.account,
      amountCents: Math.floor((totalCents * (bps[i] as number)) / 10_000),
    }));
    const leftover = totalCents - parts.reduce((n, p) => n + p.amountCents, 0);
    const target = parts.find((p) => p.accountType === remainderAccount) ?? parts[0];
    target.amountCents += leftover;
  } else {
    const cents = used.map((r) => parseDollarsToCents(r.value));
    if (cents.some((c) => c === null)) return { error: "Each amount must be a dollar figure." };
    parts = used.map((r, i) => ({ accountType: r.account, amountCents: cents[i] as number }));
    const sum = parts.reduce((n, p) => n + p.amountCents, 0);
    if (sum !== totalCents) {
      const diff = totalCents - sum;
      return {
        error:
          diff > 0
            ? `The split is ${formatPlain(diff)} short of the total.`
            : `The split is ${formatPlain(-diff)} more than the total.`,
      };
    }
  }

  parts = parts.filter((p) => p.amountCents > 0);
  if (parts.length < 2) return { error: "A split needs at least two accounts with money in them." };
  return { parts };
}

function formatPlain(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
