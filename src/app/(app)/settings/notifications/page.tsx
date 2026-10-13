import Link from "next/link";

import { Alert, Card } from "@/components/ui";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import {
  EVENT_LABELS,
  getVapidKeys,
  isEventEnabled,
  subscriptionCount,
  type NotificationEvent,
} from "@/lib/notifications";
import { toggleEvent } from "../notification-actions";
import { PushSetup, TestButton } from "../push-setup";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();
  const vapidKeys = getVapidKeys();
  const pushDeviceCount = subscriptionCount(parent.id);
  const ready = !!home?.appUrl && !!home?.vapidContact;

  return (
    <>
      <SectionHeader title="Notifications" />
      <div className="mx-auto max-w-2xl space-y-6">
        {!ready && (
          <Alert tone="warning">
            Set a public HTTPS URL and a push contact in{" "}
            <Link href="/settings/family" className="font-medium underline">
              Household and parents
            </Link>{" "}
            first. Apple rejects anything that is not a <code>mailto:</code> address or an{" "}
            <code>https://</code> URL.
          </Alert>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">This device</h2>
          <p className="mb-4 text-sm text-ink-400">
            You have {pushDeviceCount} device{pushDeviceCount === 1 ? "" : "s"} subscribed.
          </p>
          <PushSetup vapidPublicKey={vapidKeys.publicKey} />
          <div className="mt-4">
            <TestButton />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">What to send</h2>
          <ul className="space-y-2">
            {(Object.keys(EVENT_LABELS) as NotificationEvent[]).map((event) => {
              const enabled = isEventEnabled(parent.householdId, event);
              return (
                <li
                  key={event}
                  className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2 text-sm last:border-0 dark:border-ink-700"
                >
                  <span>{EVENT_LABELS[event]}</span>
                  <form action={toggleEvent}>
                    <input type="hidden" name="eventType" value={event} />
                    <input type="hidden" name="enabled" value={String(!enabled)} />
                    <button
                      type="submit"
                      className={`min-w-12 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        enabled
                          ? "bg-ledger-100 text-ledger-600"
                          : "bg-ink-100 text-ink-400 dark:bg-ink-700"
                      }`}
                    >
                      {enabled ? "On" : "Off"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
