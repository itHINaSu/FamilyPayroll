"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, household } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { getOverrides, savePolicyVersion, type PartialPolicy } from "@/lib/policy";
import { SETTINGS_SECTIONS } from "@/lib/settings-schema";

export type SettingsState = { error?: string; ok?: boolean };

/**
 * Save a settings change as a NEW policy version.
 *
 * Nothing is updated in place, so a pay stub from last year still resolves the
 * policy that produced it. Only fields the form actually submitted are written,
 * which keeps a child override genuinely partial rather than a full copy that
 * silently stops inheriting from the household.
 */
export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parent = await requireParent();

  const scopeType = String(formData.get("scopeType") ?? "household") as
    | "household"
    | "child";
  const scopeId = String(formData.get("scopeId") ?? "");

  if (scopeType === "child" && !getChild(parent.householdId, scopeId)) {
    return { error: "That child could not be found." };
  }
  if (scopeType === "household" && scopeId !== parent.householdId) {
    return { error: "That household could not be found." };
  }

  const existing = getOverrides(scopeType, scopeId);
  const payload: PartialPolicy = structuredClone(existing);

  for (const section of SETTINGS_SECTIONS) {
    for (const field of section.fields) {
      const [sectionKey, fieldKey] = field.path.split(".");
      const submitted = formData.get(field.path);

      // A child form only submits sections the parent chose to override.
      if (submitted === null && field.type !== "boolean") continue;
      if (!formData.has(`__section_${sectionKey}`)) continue;

      const bucket = ((payload as Record<string, unknown>)[sectionKey] ??= {}) as Record<
        string,
        unknown
      >;

      if (field.type === "boolean") {
        bucket[fieldKey] = submitted === "on";
      } else if (field.type === "number" || field.type === "percent") {
        const value = Number(submitted);
        if (!Number.isFinite(value)) continue;
        bucket[fieldKey] = value;
      } else if (field.path === "pay.periodStartDay") {
        bucket[fieldKey] = Number(submitted);
      } else {
        bucket[fieldKey] = String(submitted);
      }
    }
  }

  savePolicyVersion({
    scopeType,
    scopeId,
    payload,
    createdByUserId: parent.id,
  });

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "policy.updated",
      entityType: scopeType,
      entityId: scopeId,
      beforeJson: existing,
      afterJson: payload,
    })
    .run();

  revalidatePath("/settings");
  if (scopeType === "child") revalidatePath(`/children/${scopeId}/settings`);
  return { ok: true };
}

/** Drop every override for a child, returning them to the household defaults. */
export async function clearChildOverrides(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  if (!getChild(parent.householdId, childId)) return;

  savePolicyVersion({
    scopeType: "child",
    scopeId: childId,
    payload: {},
    createdByUserId: parent.id,
    note: "Cleared all overrides",
  });

  revalidatePath(`/children/${childId}/settings`);
}

export async function updateHousehold(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parent = await requireParent();

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const appUrl = String(formData.get("appUrl") ?? "").trim();
  const vapidContact = String(formData.get("vapidContact") ?? "").trim();

  if (!name) return { error: "The household needs a name." };
  if (!timezone) return { error: "A timezone is required." };

  if (appUrl && !/^https?:\/\//.test(appUrl)) {
    return { error: "The public URL must start with http:// or https://" };
  }
  // Apple's push service validates the VAPID `sub` claim and rejects anything
  // that is not a mailto: or https: value, so it is checked before it is stored.
  if (vapidContact && !/^(mailto:|https:\/\/)/.test(vapidContact)) {
    return { error: "The contact must be a mailto: address or an https:// URL." };
  }

  db.update(household)
    .set({ name, timezone, appUrl: appUrl || null, vapidContact: vapidContact || null })
    .where(eq(household.id, parent.householdId))
    .run();

  revalidatePath("/settings");
  return { ok: true };
}

/** Mint a kiosk link. Opening it once on the wall tablet pairs it for good. */
export async function createKiosk(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState & { url?: string }> {
  const parent = await requireParent();
  const name = String(formData.get("name") ?? "").trim() || "Kitchen display";

  const { createDeviceToken } = await import("@/lib/kiosk");
  const token = createDeviceToken(parent.householdId, name);

  const home = db
    .select()
    .from(household)
    .where(eq(household.id, parent.householdId))
    .get();

  const base = home?.appUrl?.replace(/\/$/, "") ?? "";

  revalidatePath("/settings");
  return { ok: true, url: `${base}/kiosk?token=${token}` };
}

export async function revokeKiosk(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const { db: database } = await import("@/db");
  const { device } = await import("@/db/schema");
  const { and } = await import("drizzle-orm");

  database
    .update(device)
    .set({ active: false })
    .where(
      and(
        eq(device.id, String(formData.get("deviceId") ?? "")),
        eq(device.householdId, parent.householdId),
      ),
    )
    .run();

  revalidatePath("/settings");
}
