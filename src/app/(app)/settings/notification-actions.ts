"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { notificationRule } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import {
  notifyParents,
  removeSubscription,
  saveSubscription,
  type NotificationEvent,
} from "@/lib/notifications";

export type NotifyState = { error?: string; ok?: string };

export async function subscribeDevice(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
): Promise<{ error?: string; ok?: boolean }> {
  const parent = await requireParent();

  if (!subscription?.endpoint || !subscription.keys?.p256dh) {
    return { error: "That subscription is incomplete." };
  }

  saveSubscription({
    userId: parent.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent,
  });

  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function unsubscribeDevice(endpoint: string): Promise<void> {
  await requireParent();
  removeSubscription(endpoint);
  revalidatePath("/settings", "layout");
}

export async function sendTest(
  _prev: NotifyState,
  _formData: FormData,
): Promise<NotifyState> {
  const parent = await requireParent();

  const delivered = await notifyParents(parent.householdId, "payroll_draft_ready", {
    title: "Family Payroll",
    body: "Notifications are working. This is what a real one will look like.",
    url: "/",
  });

  if (delivered === 0) {
    return {
      error:
        "Nothing was delivered. Check that a public HTTPS URL and a push contact are set in Settings, and that this device has been added to the home screen and granted permission.",
    };
  }

  return { ok: `Sent to ${delivered} device${delivered === 1 ? "" : "s"}.` };
}

export async function toggleEvent(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const eventType = String(formData.get("eventType") ?? "") as NotificationEvent;
  const enabled = String(formData.get("enabled")) === "true";

  const existing = db
    .select()
    .from(notificationRule)
    .where(
      and(
        eq(notificationRule.scopeId, parent.householdId),
        eq(notificationRule.eventType, eventType),
      ),
    )
    .get();

  if (existing) {
    db.update(notificationRule)
      .set({ enabled })
      .where(eq(notificationRule.id, existing.id))
      .run();
  } else {
    db.insert(notificationRule)
      .values({
        scopeType: "household",
        scopeId: parent.householdId,
        eventType,
        enabled,
      })
      .run();
  }

  revalidatePath("/settings", "layout");
}
