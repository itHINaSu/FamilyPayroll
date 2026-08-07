"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  archiveBillTemplate,
  createBillTemplate,
  disableBillTemplateForChild,
  enableBillTemplateForChild,
  updateBillTemplate,
  type BillTemplateInput,
} from "@/lib/bills";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { parseAmountToCents } from "@/lib/money";

export type BillTemplateState = { error?: string; ok?: boolean };

const TemplateSchema = z.object({
  name: z.string().trim().min(1, "Give the bill a name."),
  amount: z.string().min(1, "Enter an amount."),
  cadence: z.enum(["weekly", "monthly"]),
  dueDay: z.string().min(1),
  disposition: z.enum(["held_for_child", "disappears", "family_fund"]),
  sourceAccounts: z.enum(["checking", "checking_savings"]),
  autopay: z.string().optional(),
  mayUseEarmarked: z.string().optional(),
});

function parseTemplateInput(formData: FormData): { error: string } | { data: BillTemplateInput } {
  const parsed = TemplateSchema.safeParse({
    name: formData.get("name"),
    amount: formData.get("amount"),
    cadence: formData.get("cadence"),
    dueDay: formData.get("dueDay"),
    disposition: formData.get("disposition"),
    sourceAccounts: formData.get("sourceAccounts"),
    autopay: formData.get("autopay") ?? undefined,
    mayUseEarmarked: formData.get("mayUseEarmarked") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };

  const amountCents = parseAmountToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter a positive amount." };
  }

  return {
    data: {
      name: parsed.data.name,
      amountCents,
      cadence: parsed.data.cadence,
      dueDay: Number(parsed.data.dueDay),
      disposition: parsed.data.disposition,
      sourceAccountOrder:
        parsed.data.sourceAccounts === "checking_savings" ? ["checking", "savings"] : ["checking"],
      mayUseEarmarked: parsed.data.mayUseEarmarked === "on",
      autopay: parsed.data.autopay === "on",
    },
  };
}

export async function addBillTemplate(
  _prev: BillTemplateState,
  formData: FormData,
): Promise<BillTemplateState> {
  const parent = await requireParent();
  const result = parseTemplateInput(formData);
  if ("error" in result) return { error: result.error };

  createBillTemplate(parent.householdId, result.data);

  revalidatePath("/bills");
  return { ok: true };
}

export async function editBillTemplate(
  _prev: BillTemplateState,
  formData: FormData,
): Promise<BillTemplateState> {
  await requireParent();
  const templateId = String(formData.get("templateId") ?? "");
  const result = parseTemplateInput(formData);
  if ("error" in result) return { error: result.error };

  updateBillTemplate(templateId, result.data);

  revalidatePath("/bills");
  return { ok: true };
}

export async function archiveTemplate(formData: FormData): Promise<void> {
  await requireParent();
  archiveBillTemplate(String(formData.get("templateId") ?? ""));
  revalidatePath("/bills");
}

export async function toggleBillTemplateForChild(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const templateId = String(formData.get("templateId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const enabled = String(formData.get("enabled")) === "true";

  if (!getChild(parent.householdId, childId)) return;

  if (enabled) {
    disableBillTemplateForChild(childId, templateId);
  } else {
    enableBillTemplateForChild(parent.householdId, childId, templateId);
  }

  revalidatePath("/bills");
  revalidatePath(`/children/${childId}/bills`);
}
