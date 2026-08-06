"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import {
  LedgerError,
  recordTransaction,
  recordTransfer,
  reverseEntry,
} from "@/lib/ledger";
import { parseAmountToCents } from "@/lib/money";
import { TRANSACTION_KINDS } from "@/lib/transaction-kinds";
import type { AccountType } from "@/db/schema";

export type LedgerFormState = { error?: string; ok?: boolean };

const TransactionSchema = z.object({
  childId: z.string().min(1),
  kind: z.enum(["cash_in", "cash_out", "purchase", "donation", "adjustment"]),
  account: z.enum(["checking", "savings", "generosity", "held"]),
  amount: z.string().min(1, "Enter an amount."),
  description: z.string().trim().min(1, "Say what this was for."),
  memo: z.string().trim().optional(),
  occurredOn: z.string().optional(),
});

/**
 * A backdated entry is recorded at midday on the chosen date, in the container
 * timezone. Midday rather than midnight so that a daylight-saving shift cannot
 * push an entry onto the previous calendar day.
 */
function resolveOccurredAt(occurredOn?: string): number {
  if (!occurredOn) return Date.now();
  const parsed = new Date(`${occurredOn}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
}

export async function recordManualTransaction(
  _prev: LedgerFormState,
  formData: FormData,
): Promise<LedgerFormState> {
  const parent = await requireParent();

  const parsed = TransactionSchema.safeParse({
    childId: formData.get("childId"),
    kind: formData.get("kind"),
    account: formData.get("account"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    memo: formData.get("memo") ?? undefined,
    occurredOn: formData.get("occurredOn") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  if (!getChild(parent.householdId, parsed.data.childId)) {
    return { error: "That child could not be found." };
  }

  const kind = TRANSACTION_KINDS[parsed.data.kind];

  if (!(kind.accounts as readonly AccountType[]).includes(parsed.data.account)) {
    return { error: `A ${kind.label.toLowerCase()} cannot come from that account.` };
  }

  const magnitude = parseAmountToCents(parsed.data.amount);
  if (magnitude === null) {
    return { error: "That amount is not a valid dollar figure." };
  }

  // Adjustments carry their own sign; everything else has a fixed direction, so
  // a stray minus in the amount box cannot invert a purchase into a deposit.
  const amountCents =
    kind.direction === 0 ? magnitude : Math.abs(magnitude) * kind.direction;

  if (amountCents === 0) {
    return { error: "Enter an amount other than zero." };
  }

  try {
    recordTransaction({
      childId: parsed.data.childId,
      accountType: parsed.data.account,
      amountCents,
      type: kind.ledgerType,
      description: parsed.data.description,
      memo: parsed.data.memo || null,
      occurredAt: resolveOccurredAt(parsed.data.occurredOn),
      actorUserId: parent.id,
      source: "manual",
      allowNegative: kind.allowNegative,
    });
  } catch (error) {
    if (error instanceof LedgerError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/children/${parsed.data.childId}`);
  revalidatePath("/");
  return { ok: true };
}

const TransferSchema = z.object({
  childId: z.string().min(1),
  fromAccount: z.enum(["checking", "savings", "generosity"]),
  toAccount: z.enum(["checking", "savings", "generosity"]),
  amount: z.string().min(1, "Enter an amount."),
  description: z.string().trim().min(1, "Say what this transfer is for."),
  occurredOn: z.string().optional(),
});

export async function recordManualTransfer(
  _prev: LedgerFormState,
  formData: FormData,
): Promise<LedgerFormState> {
  const parent = await requireParent();

  const parsed = TransferSchema.safeParse({
    childId: formData.get("childId"),
    fromAccount: formData.get("fromAccount"),
    toAccount: formData.get("toAccount"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    occurredOn: formData.get("occurredOn") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  if (!getChild(parent.householdId, parsed.data.childId)) {
    return { error: "That child could not be found." };
  }

  const amountCents = parseAmountToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter a positive amount." };
  }

  try {
    recordTransfer({
      childId: parsed.data.childId,
      fromAccount: parsed.data.fromAccount,
      toAccount: parsed.data.toAccount,
      amountCents,
      description: parsed.data.description,
      occurredAt: resolveOccurredAt(parsed.data.occurredOn),
      actorUserId: parent.id,
      source: "manual",
    });
  } catch (error) {
    if (error instanceof LedgerError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/children/${parsed.data.childId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function reverseLedgerEntry(
  _prev: LedgerFormState,
  formData: FormData,
): Promise<LedgerFormState> {
  const parent = await requireParent();

  const entryId = String(formData.get("entryId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!getChild(parent.householdId, childId)) {
    return { error: "That child could not be found." };
  }

  try {
    reverseEntry(entryId, parent.id, reason || undefined);
  } catch (error) {
    if (error instanceof LedgerError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/children/${childId}`);
  revalidatePath("/");
  return { ok: true };
}
