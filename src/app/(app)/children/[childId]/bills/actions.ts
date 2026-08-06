"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bill } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { collectBill, generateInstances } from "@/lib/bills";
import { parseAmountToCents } from "@/lib/money";
import { resolvePolicy } from "@/lib/policy";

export type BillState = { error?: string; ok?: boolean };

const BillSchema = z.object({
  childId: z.string().min(1),
  name: z.string().trim().min(1, "Give the bill a name."),
  amount: z.string().min(1, "Enter an amount."),
  cadence: z.enum(["weekly", "monthly"]),
  dueDay: z.string().min(1),
  disposition: z.enum(["held_for_child", "disappears", "family_fund"]),
  sourceAccounts: z.enum(["checking", "checking_savings"]),
  autopay: z.string().optional(),
  mayUseEarmarked: z.string().optional(),
});

export async function addBill(
  _prev: BillState,
  formData: FormData,
): Promise<BillState> {
  const parent = await requireParent();

  const parsed = BillSchema.safeParse({
    childId: formData.get("childId"),
    name: formData.get("name"),
    amount: formData.get("amount"),
    cadence: formData.get("cadence"),
    dueDay: formData.get("dueDay"),
    disposition: formData.get("disposition"),
    sourceAccounts: formData.get("sourceAccounts"),
    autopay: formData.get("autopay") ?? undefined,
    mayUseEarmarked: formData.get("mayUseEarmarked") ?? undefined,
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

  const policy = resolvePolicy(parent.householdId, parsed.data.childId);

  db.insert(bill)
    .values({
      childId: parsed.data.childId,
      name: parsed.data.name,
      amountCents,
      cadence: parsed.data.cadence,
      dueDay: Number(parsed.data.dueDay),
      disposition: parsed.data.disposition,
      sourceAccountOrder:
        parsed.data.sourceAccounts === "checking_savings"
          ? ["checking", "savings"]
          : ["checking"],
      mayUseEarmarked: parsed.data.mayUseEarmarked === "on",
      autopay: parsed.data.autopay === "on",
      shortfallPolicy: policy.bills.shortfallPolicy,
      pastDueRecovery: policy.bills.pastDueRecovery,
      pastDueMaxRecoveryPct: policy.bills.pastDueMaxRecoveryPct,
      pastDueCapCents: Math.round(amountCents * policy.bills.pastDueCapMultiple),
      nonexistentDateRule: policy.bills.nonexistentDateRule,
      effectiveFrom: new Date().toLocaleDateString("en-CA"),
    })
    .run();

  generateInstances();

  revalidatePath(`/children/${parsed.data.childId}/bills`);
  return { ok: true };
}

export async function archiveBill(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const billId = String(formData.get("billId") ?? "");
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  db.update(bill)
    .set({ active: false, archivedAt: Date.now() })
    .where(eq(bill.id, billId))
    .run();

  revalidatePath(`/children/${childId}/bills`);
}

/** Collect now rather than waiting for the nightly cycle. */
export async function collectNow(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const instanceId = String(formData.get("instanceId") ?? "");
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  collectBill(instanceId);

  revalidatePath(`/children/${childId}/bills`);
  revalidatePath(`/children/${childId}`);
}
