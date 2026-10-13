"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireParent } from "@/lib/auth/guard";
import { collectBill } from "@/lib/bills";
import { getChild } from "@/lib/children";
import { LedgerError, recordSplit, recordTransfer } from "@/lib/ledger";
import { parseAmountToCents } from "@/lib/money";
import { resolvePolicy } from "@/lib/policy";
import { resolveSplit } from "@/lib/split";
import type { AccountType } from "@/db/schema";

export type MoneyFormState = { error?: string; ok?: boolean };

const ACCOUNT = z.enum(["checking", "savings", "generosity", "held"]);

const MoneySchema = z.object({
  childId: z.string().min(1),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string().min(1, "Enter an amount."),
  description: z.string().trim().min(1, "Say what this was for."),
  memo: z.string().trim().optional(),
  occurredOn: z.string().optional(),
  account: ACCOUNT.optional(),
  fromAccount: ACCOUNT.optional(),
  toAccount: ACCOUNT.optional(),
  split: z.string().optional(),
  splitMode: z.enum(["amount", "percent"]).optional(),
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

/**
 * Income, Expense or Transfer for one child. Income and expenses may be
 * split across accounts; a transfer is always one account to one account.
 * Any of them may take an account below zero — the form warns first.
 */
export async function recordMoney(
  _prev: MoneyFormState,
  formData: FormData,
): Promise<MoneyFormState> {
  const parent = await requireParent();

  const parsed = MoneySchema.safeParse({
    childId: formData.get("childId"),
    type: formData.get("type"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    memo: formData.get("memo") || undefined,
    occurredOn: formData.get("occurredOn") || undefined,
    account: formData.get("account") || undefined,
    fromAccount: formData.get("fromAccount") || undefined,
    toAccount: formData.get("toAccount") || undefined,
    split: formData.get("split") || undefined,
    splitMode: formData.get("splitMode") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const d = parsed.data;

  if (!getChild(parent.householdId, d.childId)) {
    return { error: "That child could not be found." };
  }

  const amountCents = parseAmountToCents(d.amount);
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter an amount greater than zero." };
  }
  const occurredAt = resolveOccurredAt(d.occurredOn);

  try {
    if (d.type === "transfer") {
      if (!d.fromAccount || !d.toAccount) return { error: "Pick both accounts." };
      recordTransfer({
        childId: d.childId,
        fromAccount: d.fromAccount,
        toAccount: d.toAccount,
        amountCents,
        description: d.description,
        memo: d.memo || null,
        occurredAt,
        actorUserId: parent.id,
        source: "manual",
        allowNegative: true,
      });
    } else {
      let parts: { accountType: AccountType; amountCents: number }[];

      if (d.split === "1") {
        const accounts = formData.getAll("splitAccount").map(String);
        const values = formData.getAll("splitValue").map(String);
        const rows = accounts.flatMap((a, i) => {
          const account = ACCOUNT.safeParse(a);
          return account.success ? [{ account: account.data, value: values[i] ?? "" }] : [];
        });
        const remainder = resolvePolicy(parent.householdId, d.childId).allocation.roundingBucket;
        const result = resolveSplit(amountCents, d.splitMode ?? "amount", rows, remainder);
        if ("error" in result) return { error: result.error };
        parts = result.parts;
      } else {
        parts = [{ accountType: d.account ?? "checking", amountCents }];
      }

      recordSplit({
        childId: d.childId,
        direction: d.type,
        parts,
        description: d.description,
        memo: d.memo || null,
        occurredAt,
        actorUserId: parent.id,
      });
    }
  } catch (error) {
    if (error instanceof LedgerError) return { error: error.message };
    throw error;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Collect a bill now rather than waiting for the nightly run. */
export async function collectNow(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const instanceId = String(formData.get("instanceId") ?? "");
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  collectBill(instanceId);
  revalidatePath("/", "layout");
}
