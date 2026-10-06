"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireParent } from "@/lib/auth/guard";
import { parseAmountToCents } from "@/lib/money";
import {
  archiveResponsibilityTemplate,
  createResponsibilityTemplate,
  disableTemplateForChild,
  enableTemplateForChild,
  parsePayFields,
  setTemplateAppliesToNewChildren,
  updateResponsibilityTemplate,
  type TemplateInput,
} from "@/lib/responsibilities";

export type TemplateState = { error?: string; ok?: boolean };

const TemplateSchema = z.object({
  name: z.string().trim().min(1, "Give it a name."),
  weeklyValue: z.string().min(1, "Enter a weekly amount."),
  cadence: z.enum(["daily", "daily_selected", "weekly", "up_to_n"]),
  maxOccurrences: z.string().optional(),
  daysOfWeek: z.array(z.string()).optional(),
});

function parseTemplateInput(formData: FormData): { error: string } | { data: TemplateInput } {
  const parsed = TemplateSchema.safeParse({
    name: formData.get("name"),
    weeklyValue: formData.get("weeklyValue"),
    cadence: formData.get("cadence"),
    maxOccurrences: formData.get("maxOccurrences") ?? undefined,
    daysOfWeek: formData.getAll("daysOfWeek").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };

  const weeklyValueCents = parseAmountToCents(parsed.data.weeklyValue);
  if (weeklyValueCents === null || weeklyValueCents <= 0) {
    return { error: "Enter a positive weekly amount." };
  }

  const days = (parsed.data.daysOfWeek ?? []).map(Number).filter((n) => !Number.isNaN(n));
  if (parsed.data.cadence === "daily_selected" && days.length === 0) {
    return { error: "Choose at least one day." };
  }

  return {
    data: {
      name: parsed.data.name,
      weeklyValueCents,
      cadence: parsed.data.cadence,
      daysOfWeek: days,
      maxOccurrences: parsed.data.cadence === "up_to_n" ? Math.max(1, Number(parsed.data.maxOccurrences ?? 1)) : null,
      ...parsePayFields(formData),
    },
  };
}

export async function addResponsibilityTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const parent = await requireParent();
  const result = parseTemplateInput(formData);
  if ("error" in result) return { error: result.error };

  createResponsibilityTemplate(parent.householdId, result.data);

  revalidatePath("/responsibilities");
  return { ok: true };
}

export async function editResponsibilityTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  await requireParent();
  const templateId = String(formData.get("templateId") ?? "");
  const result = parseTemplateInput(formData);
  if ("error" in result) return { error: result.error };

  updateResponsibilityTemplate(templateId, result.data);

  revalidatePath("/responsibilities");
  revalidatePath(`/responsibilities/${templateId}`);
  return { ok: true };
}

export async function archiveTemplate(formData: FormData): Promise<void> {
  await requireParent();
  archiveResponsibilityTemplate(String(formData.get("templateId") ?? ""));
  revalidatePath("/responsibilities");
}

export async function setAppliesToNewChildren(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const templateId = String(formData.get("templateId") ?? "");
  setTemplateAppliesToNewChildren(
    parent.householdId,
    templateId,
    formData.get("appliesToNewChildren") === "on",
  );
  revalidatePath(`/responsibilities/${templateId}`);
}

export async function toggleTemplateForChild(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const templateId = String(formData.get("templateId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const enabled = String(formData.get("enabled")) === "true";

  const { getChild } = await import("@/lib/children");
  if (!getChild(parent.householdId, childId)) return;

  if (enabled) {
    disableTemplateForChild(childId, templateId);
  } else {
    enableTemplateForChild(childId, templateId);
  }

  revalidatePath("/responsibilities");
  revalidatePath(`/responsibilities/${templateId}`);
  revalidatePath(`/children/${childId}/responsibilities`);
}
