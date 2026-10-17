"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, household, payPeriod, paystub, user } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  formatSecretForDisplay,
  generateRecoveryCodes,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from "@/lib/auth/totp";
import { UsernameSchema } from "@/lib/auth/username";
import { createBackup, resetHistory, restoreFromUpload, type ResetScope } from "@/lib/backup";
import { pausePayroll, payrollPausedOn, resumePayroll } from "@/lib/payroll-pause";
import { getChild } from "@/lib/children";
import { formatDateRange, formatShortDate, todayInHousehold } from "@/lib/dates";
import { getOverrides, resolvePolicy, type PolicyChange } from "@/lib/policy";
import { runPayrollCycle } from "@/lib/payroll";
import {
  periodChoice,
  previewPayChoices,
  saveDatedChanges,
  type PayPreview,
} from "@/lib/policy-schedule";
import { SETTINGS_SECTIONS, getAtPath } from "@/lib/settings-schema";

export type SettingsState = { error?: string; ok?: boolean; message?: string };
export type BackupState = { error?: string; ok?: boolean; message?: string };

const MAX_RESTORE_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Pay-affecting changes start on the date the parent chose: the start of this
 * pay period, or the day the next one begins. Everything else (who can move
 * money, display, kiosk) starts today.
 */
function saveDated(input: {
  householdId: string;
  scopeType: "household" | "child";
  scopeId: string;
  changes: PolicyChange[];
  applyFrom: FormDataEntryValue | null;
  userId: string;
  note?: string;
}): { startsOn: string | null; paidNow: { startDate: string; endDate: string }[] } {
  const today = todayInHousehold();
  const { payChanged, startsOn } = saveDatedChanges({
    householdId: input.householdId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    changes: input.changes,
    applyFrom: input.applyFrom === "next" ? "next" : "current",
    today,
    createdByUserId: input.userId,
    note: input.note,
  });

  // A schedule change can leave a period that has already ended and is due —
  // pay it now, as this morning's run would have with the change in place,
  // rather than a day late at tomorrow's.
  let paidNow: { startDate: string; endDate: string }[] = [];
  if (payChanged && !payrollPausedOn(input.householdId)) {
    const { posted } = runPayrollCycle(today, { householdId: input.householdId });
    if (posted.length > 0) {
      paidNow = db
        .selectDistinct({ startDate: payPeriod.startDate, endDate: payPeriod.endDate })
        .from(paystub)
        .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
        .where(inArray(paystub.id, posted))
        .all();
    }
  }
  return { startsOn, paidNow };
}

/**
 * The changes a settings form asks for, compared with what it was showing —
 * so saving one field can't overwrite a different change that's already
 * scheduled for the next pay period. At child scope a ticked section becomes
 * an override and an unticked one goes back to the family's rules.
 */
function collectChanges(
  householdId: string,
  formData: FormData,
):
  | { error: string }
  | {
      scopeType: "household" | "child";
      scopeId: string;
      changes: PolicyChange[];
      overrides: Record<string, unknown>;
      today: string;
    } {
  const scopeType = String(formData.get("scopeType") ?? "household") as
    | "household"
    | "child";
  const scopeId = String(formData.get("scopeId") ?? "");

  if (scopeType === "child" && !getChild(householdId, scopeId)) {
    return { error: "That child could not be found." };
  }
  if (scopeType === "household" && scopeId !== householdId) {
    return { error: "That household could not be found." };
  }

  const today = todayInHousehold();
  const shown = resolvePolicy(householdId, scopeType === "child" ? scopeId : null, today);
  const overrides = getOverrides(scopeType, scopeId, today) as Record<string, unknown>;
  const rendered = new Set(formData.getAll("__fields").map(String));
  const changes: PolicyChange[] = [];

  for (const section of SETTINGS_SECTIONS) {
    if (!section.fields.some((f) => rendered.has(f.path))) continue; // not on this page

    const ticked = formData.has(`__section_${section.key}`);
    const wasOverride = section.key in overrides;

    if (scopeType === "child" && !ticked) {
      if (wasOverride) changes.push({ kind: "removeSection", section: section.key });
      continue;
    }
    if (!ticked) continue;

    for (const field of section.fields) {
      if (!rendered.has(field.path)) continue;
      const submitted = formData.get(field.path);

      let value: unknown;
      if (field.type === "boolean") {
        value = submitted === "on";
      } else if (field.type === "number" || field.type === "percent" || field.type === "payday") {
        value = Number(submitted);
        if (submitted === null || !Number.isFinite(value)) continue;
      } else if (field.path === "pay.periodStartDay") {
        value = Number(submitted);
      } else {
        if (submitted === null) continue;
        value = String(submitted);
      }

      // A newly ticked child section records every field, so the override
      // holds even when the family's values change later.
      const newOverride = scopeType === "child" && !wasOverride;
      if (newOverride || value !== getAtPath(shown, field.path)) {
        changes.push({ kind: "set", path: field.path, value });
      }
    }
  }

  return { scopeType, scopeId, changes, overrides, today };
}

/**
 * Save a settings change as NEW policy versions — nothing is updated in
 * place, so a pay stub from last year still resolves the policy that
 * produced it.
 */
export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parent = await requireParent();
  const collected = collectChanges(parent.householdId, formData);
  if ("error" in collected) return { error: collected.error };
  const { scopeType, scopeId, changes, overrides, today } = collected;

  if (changes.length === 0) return { ok: true, message: "Nothing changed." };

  const { startsOn, paidNow } = saveDated({
    householdId: parent.householdId,
    scopeType,
    scopeId,
    changes,
    applyFrom: formData.get("applyFrom"),
    userId: parent.id,
  });

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "policy.updated",
      entityType: scopeType,
      entityId: scopeId,
      beforeJson: overrides,
      afterJson: { changes, applyFrom: formData.get("applyFrom") ?? "today" },
    })
    .run();

  revalidatePath("/", "layout");

  // After a pay-schedule change, say what was paid and what the current
  // period has become — a transition period can run longer or shorter.
  let periodNote = "";
  if (paidNow.length > 0) {
    periodNote += ` ${paidNow.map((p) => formatDateRange(p.startDate, p.endDate)).join(" and ")} was due, so it's been paid.`;
  }
  if (changes.some((c) => c.kind === "set" && c.path.startsWith("pay."))) {
    const p = periodChoice(parent.householdId, scopeType === "child" ? scopeId : null, today);
    periodNote += ` This pay period is now ${formatDateRange(p.startDate, p.endDate)}, paid ${formatShortDate(p.payDate)}.`;
  }

  return {
    ok: true,
    message:
      (startsOn
        ? `Saved. It starts with the pay period that begins ${formatShortDate(startsOn)}.`
        : "Saved.") + periodNote,
  };
}

/**
 * For the "when should this start?" prompt: what each answer would do to the
 * pay periods, before anything is saved.
 */
export async function previewSettings(formData: FormData): Promise<PayPreview | null> {
  const parent = await requireParent();
  const collected = collectChanges(parent.householdId, formData);
  if ("error" in collected || collected.changes.length === 0) return null;
  return previewPayChoices({
    householdId: parent.householdId,
    scopeType: collected.scopeType,
    scopeId: collected.scopeId,
    changes: collected.changes,
    today: collected.today,
  });
}

/** Drop every override for a child, returning them to the family's rules. */
export async function clearChildOverrides(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  if (!getChild(parent.householdId, childId)) return;

  const overrides = getOverrides("child", childId, todayInHousehold());
  saveDated({
    householdId: parent.householdId,
    scopeType: "child",
    scopeId: childId,
    changes: Object.keys(overrides).map((section) => ({ kind: "removeSection", section })),
    applyFrom: formData.get("applyFrom"),
    userId: parent.id,
    note: "Back to the family's rules",
  });

  revalidatePath("/", "layout");
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

  revalidatePath("/settings", "layout");
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

  revalidatePath("/settings", "layout");
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

  revalidatePath("/settings", "layout");
}

/** Mint a one-time link that turns into a second parent login. */
export async function inviteParent(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState & { url?: string }> {
  const parent = await requireParent();
  const { createInvite } = await import("@/lib/invites");

  const token = createInvite(parent.householdId, parent.id, { role: "parent" });

  const home = db
    .select()
    .from(household)
    .where(eq(household.id, parent.householdId))
    .get();
  const base = home?.appUrl?.replace(/\/$/, "") ?? "";

  revalidatePath("/settings", "layout");
  return { ok: true, url: `${base}/invite/${token}` };
}

export async function cancelInvite(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const { revokeInvite } = await import("@/lib/invites");

  revokeInvite(parent.householdId, String(formData.get("inviteId") ?? ""));
  revalidatePath("/settings", "layout");
}

/**
 * Deactivates a parent login (their history stays; they just can no longer
 * sign in). Guarded on the server, not just hidden in the UI: nobody can
 * deactivate themselves this way, and the household can never be left with
 * zero active parents — both would be a lockout with no email-based recovery
 * to fall back on.
 */
export async function deactivateParent(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parent = await requireParent();
  const targetId = String(formData.get("userId") ?? "");

  if (targetId === parent.id) {
    return { error: "You cannot deactivate your own login." };
  }

  const target = db
    .select()
    .from(user)
    .where(and(eq(user.id, targetId), eq(user.householdId, parent.householdId), eq(user.role, "parent")))
    .get();
  if (!target) return { error: "That parent could not be found." };

  const activeParents = db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.householdId, parent.householdId), eq(user.role, "parent"), eq(user.active, true)))
    .all();
  if (activeParents.length <= 1) {
    return { error: "A household needs at least one active parent login." };
  }

  db.update(user).set({ active: false }).where(eq(user.id, targetId)).run();

  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function reactivateParent(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const targetId = String(formData.get("userId") ?? "");

  db.update(user)
    .set({ active: true })
    .where(and(eq(user.id, targetId), eq(user.householdId, parent.householdId), eq(user.role, "parent")))
    .run();

  revalidatePath("/settings", "layout");
}

/**
 * The parent's own login — name, username, password.
 *
 * A current password is required the moment either the username or the
 * password itself is changing; changing just the display name does not need
 * it. The session cookie itself never has to change: it looks up the user
 * row fresh on every request, so a new username or password takes effect
 * immediately without a forced re-login.
 */
export async function updateAccount(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parent = await requireParent();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const parsedUsername = UsernameSchema.safeParse(formData.get("email"));
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!displayName) return { error: "A name is required." };
  if (!parsedUsername.success) {
    return { error: parsedUsername.error.issues[0]?.message ?? "Check the username." };
  }
  const email = parsedUsername.data;

  const row = db.select().from(user).where(eq(user.id, parent.id)).get();
  if (!row) return { error: "Your account could not be found." };

  const changingEmail = email !== row.email.toLowerCase();
  const changingPassword = newPassword.length > 0;

  if (changingEmail || changingPassword) {
    if (!currentPassword) {
      return {
        error: "Enter your current password to change your username or password.",
      };
    }
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      return { error: "Current password is incorrect." };
    }
  }

  if (changingEmail) {
    const clash = db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, email), ne(user.id, parent.id)))
      .get();
    if (clash) return { error: "That username is already taken." };
  }

  const updates: { displayName: string; email: string; passwordHash?: string } = {
    displayName,
    email,
  };

  if (changingPassword) {
    if (newPassword.length < 8) {
      return { error: "A new password needs at least 8 characters." };
    }
    if (newPassword !== confirmPassword) {
      return { error: "New passwords do not match." };
    }
    updates.passwordHash = await hashPassword(newPassword);
  }

  db.update(user).set(updates).where(eq(user.id, parent.id)).run();

  revalidatePath("/settings", "layout");
  return { ok: true };
}

/** An on-demand snapshot, identical to the nightly one, taken right now. */
export async function backupNow(
  _prev: BackupState,
  _formData: FormData,
): Promise<BackupState> {
  const parent = await requireParent();

  const target = createBackup();

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "backup.created",
      entityType: "household",
      entityId: parent.householdId,
      afterJson: { file: target.split("/").pop() },
    })
    .run();

  revalidatePath("/settings", "layout");
  return { ok: true, message: `Saved ${target.split("/").pop()}.` };
}

/**
 * Replace the whole database with an uploaded backup.
 *
 * The form requires an explicit confirmation checkbox, checked again here
 * server-side rather than trusted from the client — this is the single most
 * destructive action available in the app, undoing every paycheck and
 * completion back to whatever moment the upload was taken. A safety snapshot
 * of the current database is always written first, so even a mistaken
 * restore is one more upload away from undone.
 */
export async function restoreBackup(
  _prev: BackupState,
  formData: FormData,
): Promise<BackupState> {
  const parent = await requireParent();

  const confirmed = formData.get("confirmed") === "on";
  if (!confirmed) {
    return { error: "Check the confirmation box to proceed." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a backup file first." };
  }
  if (file.size > MAX_RESTORE_UPLOAD_BYTES) {
    return { error: "That file is larger than this app's databases ever get." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = restoreFromUpload(bytes);

  if (!result.ok) return { error: result.error };

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "backup.restored",
      entityType: "household",
      entityId: parent.householdId,
      afterJson: { safetyBackup: result.safetyBackup.split("/").pop() },
    })
    .run();

  return {
    ok: true,
    message:
      "Restored. A safety copy of what was running before is saved. Restart the app for the restored data to take effect.",
  };
}

export type PayrollState = { error?: string; message?: string };

export async function togglePayroll(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const parent = await requireParent();
  const pause = formData.get("intent") === "pause";

  let message: string;
  if (pause) {
    const { discardedDrafts, clearedBills } = pausePayroll(parent.householdId, parent.id);
    const parts = [
      discardedDrafts > 0 && `${discardedDrafts} unposted pay stub${discardedDrafts === 1 ? "" : "s"} discarded`,
      clearedBills > 0 && `${clearedBills} upcoming bill${clearedBills === 1 ? "" : "s"} cleared`,
    ].filter(Boolean);
    message = `Payroll paused.${parts.length ? ` ${parts.join(", ")}.` : ""}`;
  } else {
    const { excusedDays } = resumePayroll(parent.householdId, parent.id);
    message = `Payroll started.${
      excusedDays > 0
        ? ` The ${excusedDays} paused day${excusedDays === 1 ? " is" : "s are"} excused, not counted as missed.`
        : ""
    }`;
  }

  revalidatePath("/", "layout");
  return { message };
}

const RESET_LABELS: Record<keyof ResetScope, string> = {
  money: "balances and payroll history",
  chores: "expectation check-offs and misses",
  jobs: "extra-job claims",
};

/**
 * Clear the chosen history, keeping all setup.
 *
 * Gated twice, both checked here rather than trusted from the client: the
 * current password, and typing RESET. A safety snapshot is written first,
 * so even this is one restore away from undone.
 */
export async function resetHistoryAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const parent = await requireParent();

  const scope: ResetScope = {
    money: formData.get("money") === "on",
    chores: formData.get("chores") === "on",
    jobs: formData.get("jobs") === "on",
  };
  const chosen = (Object.keys(scope) as (keyof ResetScope)[]).filter((k) => scope[k]);
  if (chosen.length === 0) {
    return { error: "Tick at least one thing to clear." };
  }

  if (String(formData.get("confirmText") ?? "").trim() !== "RESET") {
    return { error: "Type RESET (in capitals) to confirm." };
  }

  const row = db.select().from(user).where(eq(user.id, parent.id)).get();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!row || !currentPassword || !(await verifyPassword(currentPassword, row.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "household.history_reset",
      entityType: "household",
      entityId: parent.householdId,
      afterJson: scope,
    })
    .run();

  resetHistory(parent.householdId, scope);
  revalidatePath("/", "layout");

  const list = chosen.map((k) => RESET_LABELS[k]);
  const joined =
    list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return {
    message: `Cleared ${joined}. A backup was saved first.`,
  };
}

export type MfaEnrollState = {
  error?: string;
  secret?: string;
  secretDisplay?: string;
  uri?: string;
};

/**
 * Step one of enrollment: generate a secret and hold it, unconfirmed.
 *
 * Writing it before it is confirmed is deliberate and safe — `totpEnabledAt`
 * is what the login flow actually checks, and that is only set once a real
 * code from this secret has been verified. An abandoned enrollment just sits
 * there inert until overwritten by the next attempt.
 */
export async function startMfaEnrollment(
  _prev: MfaEnrollState,
  _formData: FormData,
): Promise<MfaEnrollState> {
  const parent = await requireParent();

  const secret = generateTotpSecret();
  db.update(user)
    .set({ totpSecret: secret, totpEnabledAt: null, totpRecoveryCodesJson: null })
    .where(eq(user.id, parent.id))
    .run();

  return {
    secret,
    secretDisplay: formatSecretForDisplay(secret),
    uri: totpUri(secret, parent.email),
  };
}

export type MfaConfirmState = { error?: string; recoveryCodes?: string[] };

/** Step two: a real code from the secret turns it on and mints recovery codes. */
export async function confirmMfaEnrollment(
  _prev: MfaConfirmState,
  formData: FormData,
): Promise<MfaConfirmState> {
  const parent = await requireParent();

  const row = db.select().from(user).where(eq(user.id, parent.id)).get();
  if (!row?.totpSecret) {
    return { error: "Start enrollment again — nothing pending was found." };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!verifyTotp(row.totpSecret, code)) {
    return { error: "That code didn't match. Check the time on your device." };
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashed = await Promise.all(
    recoveryCodes.map(async (c) => ({ hash: await hashPassword(c), usedAt: null })),
  );

  db.update(user)
    .set({ totpEnabledAt: Date.now(), totpRecoveryCodesJson: hashed })
    .where(eq(user.id, parent.id))
    .run();

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "mfa.enabled",
      entityType: "user",
      entityId: parent.id,
    })
    .run();

  // No revalidatePath here: it would re-render the settings page mid-flow
  // with the server's now-true `enabled` prop, unmounting this very form
  // before the recovery codes it just returned are ever shown. The client
  // switches views itself once the parent confirms the codes were saved; the
  // next real navigation picks up the server's fresh state naturally.
  return { recoveryCodes };
}

/** Cancels a pending or active enrollment. Requires the current password. */
export async function disableMfa(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parent = await requireParent();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const row = db.select().from(user).where(eq(user.id, parent.id)).get();
  if (!row) return { error: "Your account could not be found." };

  if (!currentPassword || !(await verifyPassword(currentPassword, row.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  db.update(user)
    .set({ totpSecret: null, totpEnabledAt: null, totpRecoveryCodesJson: null })
    .where(eq(user.id, parent.id))
    .run();

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "mfa.disabled",
      entityType: "user",
      entityId: parent.id,
    })
    .run();

  revalidatePath("/settings", "layout");
  return { ok: true };
}
