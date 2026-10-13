import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import webpush from "web-push";

import { db } from "@/db";
import {
  household,
  notificationLog,
  notificationRule,
  pushSubscription,
  user,
} from "@/db/schema";
import { getOrCreateSecret, SECRET_KEYS } from "@/lib/secrets";

/**
 * Notifications (SPEC §8).
 *
 * W3C Web Push to an installed PWA, behind a narrow adapter surface so a native
 * APNs client can be added later without touching the event catalogue.
 *
 * **Nothing here is load-bearing.** Focus modes, Low Power Mode, and the
 * notification summary all delay or batch delivery, and none of it is under our
 * control. Payroll drafts and posts on schedule whether or not anyone read the
 * alert; bills draw on their due date regardless. A notification is a nudge
 * toward follow-through, never a step in it.
 */

export type NotificationEvent =
  | "payroll_draft_ready"
  | "payroll_posted"
  | "bill_due_soon"
  | "bill_shortfall_predicted"
  | "bill_past_due"
  | "past_due_cap_reached"
  | "job_submitted"
  | "approval_requested"
  | "goal_reached"
  | "interest_posted";

export const EVENT_LABELS: Record<NotificationEvent, string> = {
  payroll_draft_ready: "A pay stub is ready to review",
  payroll_posted: "Payroll posted",
  bill_due_soon: "A bill is coming due",
  bill_shortfall_predicted: "A child will be short for a bill",
  bill_past_due: "A bill went unpaid",
  past_due_cap_reached: "Past due has hit its cap",
  job_submitted: "A job is waiting for approval",
  approval_requested: "A child asked for something",
  goal_reached: "A savings goal was reached",
  interest_posted: "Interest was paid",
};

/** Off by default: these fire often enough to become noise. */
const DEFAULT_OFF: NotificationEvent[] = ["interest_posted"];

export function getVapidKeys(): { publicKey: string; privateKey: string } {
  // Generated once on first use and persisted, so replacing the container does
  // not invalidate every push subscription on every phone in the house.
  const existing = getOrCreateSecret(SECRET_KEYS.vapidPublicKey, () => {
    const generated = webpush.generateVAPIDKeys();
    return JSON.stringify(generated);
  });

  const parsed = JSON.parse(existing) as { publicKey: string; privateKey: string };
  return parsed;
}

function configure(householdId: string): boolean {
  const home = db.select().from(household).where(eq(household.id, householdId)).get();

  // Apple validates the VAPID `sub` claim and rejects anything that is not a
  // mailto: or https: value, so a missing contact means push cannot work at all.
  if (!home?.vapidContact) return false;

  const keys = getVapidKeys();
  webpush.setVapidDetails(home.vapidContact, keys.publicKey, keys.privateKey);
  return true;
}

export function isEventEnabled(
  householdId: string,
  event: NotificationEvent,
): boolean {
  const rule = db
    .select()
    .from(notificationRule)
    .where(
      and(
        eq(notificationRule.scopeId, householdId),
        eq(notificationRule.eventType, event),
      ),
    )
    .get();

  return rule ? rule.enabled : !DEFAULT_OFF.includes(event);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Send to every parent's subscribed device.
 *
 * Subscriptions die silently — a reinstalled home-screen app, a cleared browser
 * — so a 404 or 410 prunes the row rather than being retried forever.
 */
export async function notifyParents(
  householdId: string,
  event: NotificationEvent,
  payload: PushPayload,
): Promise<number> {
  if (!isEventEnabled(householdId, event)) return 0;
  if (!configure(householdId)) return 0;

  // Dedupe: the scheduler is deliberately re-entrant, so the same nudge can be
  // computed several times a day. One delivery per payload per 12 hours.
  const hash = createHash("sha256")
    .update(`${event}:${payload.title}:${payload.body}`)
    .digest("hex");

  const recent = db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.payloadHash, hash),
        gt(notificationLog.sentAt, Date.now() - 12 * 3_600_000),
      ),
    )
    .get();

  if (recent) return 0;

  const parents = db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.householdId, householdId), eq(user.role, "parent")))
    .all();

  const subscriptions = db
    .select()
    .from(pushSubscription)
    .all()
    .filter((s) => parents.some((p) => p.id === s.userId) && !s.expiredAt);

  let delivered = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
        },
        JSON.stringify(payload),
      );

      db.update(pushSubscription)
        .set({ lastSuccessAt: Date.now(), failureCount: 0 })
        .where(eq(pushSubscription.id, sub.id))
        .run();

      delivered++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      if (status === 404 || status === 410) {
        db.update(pushSubscription)
          .set({ expiredAt: Date.now() })
          .where(eq(pushSubscription.id, sub.id))
          .run();
      } else {
        db.update(pushSubscription)
          .set({ failureCount: sub.failureCount + 1 })
          .where(eq(pushSubscription.id, sub.id))
          .run();
      }
    }
  }

  db.insert(notificationLog)
    .values({
      eventType: event,
      payloadHash: hash,
      result: delivered > 0 ? "delivered" : "no_subscribers",
      detail: `${delivered}/${subscriptions.length}`,
    })
    .run();

  return delivered;
}

export function saveSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): void {
  db.insert(pushSubscription)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      p256dhKey: input.p256dh,
      authKey: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId: input.userId,
        p256dhKey: input.p256dh,
        authKey: input.auth,
        expiredAt: null,
        failureCount: 0,
      },
    })
    .run();
}

export function removeSubscription(endpoint: string): void {
  db.delete(pushSubscription)
    .where(eq(pushSubscription.endpoint, endpoint))
    .run();
}

export function subscriptionCount(userId: string): number {
  return db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .all()
    .filter((s) => !s.expiredAt).length;
}
