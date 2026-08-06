import { Alert, Card, PageHeader } from "@/components/ui";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import {
  EVENT_LABELS,
  getVapidKeys,
  isEventEnabled,
  subscriptionCount,
  type NotificationEvent,
} from "@/lib/notifications";
import { toggleEvent } from "./actions";
import { PushSetup, TestButton } from "./push-setup";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const parent = await requireParent();
  const home = getHousehold();
  const keys = getVapidKeys();
  const devices = subscriptionCount(parent.id);

  const ready = !!home?.appUrl && !!home?.vapidContact;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Nudges toward follow-through. Nothing in the system depends on you seeing one."
      />

      <div className="space-y-6">
        {!ready && (
          <Alert tone="warning">
            Set a public HTTPS URL and a push contact in Settings first. Apple
            validates the contact and rejects anything that is not a{" "}
            <code>mailto:</code> address or an <code>https://</code> URL.
          </Alert>
        )}

        <Card>
          <h2 className="mb-1 text-lg font-semibold">This device</h2>
          <p className="mb-4 text-sm text-ink-400">
            You have {devices} device{devices === 1 ? "" : "s"} subscribed.
          </p>
          <PushSetup vapidPublicKey={keys.publicKey} />
          <div className="mt-4">
            <TestButton />
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">What to send</h2>
          <p className="mb-4 text-xs text-ink-400">
            The shortfall warning is the one that matters most — &ldquo;rent is due
            in 3 days, you have $12, you need $15&rdquo; is where planning ahead
            actually gets learned.
          </p>

          <ul className="space-y-2">
            {(Object.keys(EVENT_LABELS) as NotificationEvent[]).map((event) => {
              const enabled = isEventEnabled(parent.householdId, event);
              return (
                <li
                  key={event}
                  className="flex items-center justify-between border-b border-ink-100 pb-2 text-sm last:border-0 dark:border-ink-700"
                >
                  <span>{EVENT_LABELS[event]}</span>
                  <form action={toggleEvent}>
                    <input type="hidden" name="eventType" value={event} />
                    <input type="hidden" name="enabled" value={String(!enabled)} />
                    <button
                      type="submit"
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
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
