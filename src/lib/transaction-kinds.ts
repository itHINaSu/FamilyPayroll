import type { AccountType } from "@/db/schema";

/**
 * What a parent records by hand: money in, money out, or money moved
 * between two of one child's accounts. Shared by the server action and the
 * client form, so it lives outside both.
 *
 * There is no "adjustment" or "reverse": a mistake is fixed with a transfer
 * (or an opposite entry), so the history always shows both.
 */
export const MONEY_TYPES = {
  income: { label: "Income", placeholder: "Birthday money from Grandma" },
  expense: { label: "Expense", placeholder: "Pokémon cards" },
  transfer: { label: "Transfer", placeholder: "Saving for a Lego set" },
} as const;

export type MoneyType = keyof typeof MONEY_TYPES;

/** Every account a parent can record against. Held is never shown to the child. */
export const ALL_ACCOUNTS: readonly AccountType[] = ["checking", "savings", "generosity", "held"];

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  generosity: "Generosity",
  held: "Held",
};
