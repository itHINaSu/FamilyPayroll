import type { AccountType, LedgerEntryType } from "@/db/schema";

/**
 * The manual money actions a parent performs.
 *
 * Each kind fixes the ledger type, the direction, and which accounts are
 * eligible, so the form cannot produce a nonsensical combination — a donation
 * out of Checking, or a purchase that somehow increases a balance.
 *
 * Shared by the server action and the client form, so it lives outside both.
 */
export const TRANSACTION_KINDS = {
  cash_in: {
    label: "Cash in",
    hint: "Birthday money, tooth fairy, money found in a coat pocket.",
    ledgerType: "cash_deposit",
    direction: 1,
    accounts: ["checking", "savings", "generosity"],
    allowNegative: false,
  },
  cash_out: {
    label: "Cash out",
    hint: "They asked for physical money. It leaves the ledger and enters their pocket.",
    ledgerType: "cash_withdrawal",
    direction: -1,
    accounts: ["checking", "savings"],
    allowNegative: false,
  },
  purchase: {
    label: "Purchase",
    hint: "You bought something for them and are deducting it.",
    ledgerType: "purchase",
    direction: -1,
    accounts: ["checking", "savings"],
    allowNegative: false,
  },
  donation: {
    label: "Donation",
    hint: "Money given away. Record who it went to — this becomes the giving history.",
    ledgerType: "donation",
    direction: -1,
    accounts: ["generosity"],
    allowNegative: false,
  },
  adjustment: {
    label: "Adjustment",
    hint: "The escape hatch. May be negative, and is the only thing allowed to overdraw an account.",
    ledgerType: "adjustment",
    /** Zero means the sign comes from what was typed. */
    direction: 0,
    accounts: ["checking", "savings", "generosity", "held"],
    allowNegative: true,
  },
} as const satisfies Record<
  string,
  {
    label: string;
    hint: string;
    ledgerType: LedgerEntryType;
    direction: 1 | -1 | 0;
    accounts: readonly AccountType[];
    allowNegative: boolean;
  }
>;

export type TransactionKind = keyof typeof TRANSACTION_KINDS;

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  generosity: "Generosity",
  held: "Held for the future",
};
