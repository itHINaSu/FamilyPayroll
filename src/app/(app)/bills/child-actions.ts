"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bill } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { generateInstances } from "@/lib/bills";
import { parseAmountToCents } from "@/lib/money";

export type BillState = { error?: string; ok?: boolean };

const EditBillSchema = z.object({
  billId: z.string().min(1),
  childId: z.string().min(1),
  amount: z.string().min(1, "Enter an amount."),
  cadence: z.enum(["weekly", "monthly"]),
  dueDay: z.string().min(1),
});

/** A direct edit to one child's own copy — "modify per child." */
export async function editBill(_prev: BillState, formData: FormData): Promise<BillState> {
  const parent = await requireParent();

  const parsed = EditBillSchema.safeParse({
    billId: formData.get("billId"),
    childId: formData.get("childId"),
    amount: formData.get("amount"),
    cadence: formData.get("cadence"),
    dueDay: formData.get("dueDay"),
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

  db.update(bill)
    .set({
      amountCents,
      cadence: parsed.data.cadence,
      dueDay: Number(parsed.data.dueDay),
      syncedWithTemplate: false,
    })
    .where(eq(bill.id, parsed.data.billId))
    .run();

  generateInstances();

  revalidatePath("/", "layout");
  return { ok: true };
}
