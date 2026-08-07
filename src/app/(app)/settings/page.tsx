import { Alert, Card, PageHeader } from "@/components/ui";
import { SettingsEditor } from "@/components/settings-editor";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { listBackups } from "@/lib/backup";
import { heldFundTotal } from "@/lib/bills";
import { config } from "@/lib/config";
import { formatCents } from "@/lib/money";
import {
  EVENT_LABELS,
  getVapidKeys,
  isEventEnabled,
  subscriptionCount,
  type NotificationEvent,
} from "@/lib/notifications";
import { listPendingInvites } from "@/lib/invites";
import { checkGuardrails, getOverrides, resolveHouseholdPolicy } from "@/lib/policy";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { device, user } from "@/db/schema";
import { AccountForm } from "./account-form";
import { BackupControls } from "./backup-controls";
import { HouseholdForm } from "./household-form";
import { KioskForm } from "./kiosk-form";
import { MfaForm } from "./mfa-form";
import { toggleEvent } from "./notification-actions";
import { ParentsForm } from "./parents-form";
import { PushSetup, TestButton } from "./push-setup";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function SettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const overrides = getOverrides("household", parent.householdId);
  const warnings = checkGuardrails(policy);
  const backups = listBackups();
  const held = heldFundTotal(parent.householdId);

  const account = db.select().from(user).where(eq(user.id, parent.id)).get();

  const parents = db
    .select()
    .from(user)
    .where(and(eq(user.householdId, parent.householdId), eq(user.role, "parent")))
    .all();
  const pendingInvites = listPendingInvites(parent.householdId, "parent");

  const devices = db
    .select()
    .from(device)
    .where(and(eq(device.householdId, parent.householdId), eq(device.active, true)))
    .all();

  const vapidKeys = getVapidKeys();
  const pushDeviceCount = subscriptionCount(parent.id);
  const notificationsReady = !!home?.appUrl && !!home?.vapidContact;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="How the app behaves. Household defaults can be overridden per child."
      />

      <div className="space-y-6">
        {warnings.map((w) => (
          <Alert key={w.field} tone="warning">
            {w.message}
          </Alert>
        ))}

        <AccountForm
          account={{
            displayName: account?.displayName ?? "",
            email: account?.email ?? "",
          }}
        />

        <MfaForm enabled={!!account?.totpEnabledAt} />

        <ParentsForm
          parents={parents.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            email: p.email,
            active: p.active,
          }))}
          invites={pendingInvites.map((i) => ({
            id: i.id,
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
          }))}
          selfId={parent.id}
        />

        <HouseholdForm
          household={{
            name: home?.name ?? "",
            timezone: home?.timezone ?? "UTC",
            appUrl: home?.appUrl ?? "",
            vapidContact: home?.vapidContact ?? "",
          }}
        />

        {held > 0 && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Held for the children</h2>
            <p className="mb-3 text-xs text-ink-400">
              Money collected from bills set to be held. Parents only — never shown
              to a child or on the kiosk. This is what you are actually holding on
              their behalf.
            </p>
            <p className="tnum text-3xl">{formatCents(held)}</p>
          </Card>
        )}

        <KioskForm
          devices={devices.map((d) => ({
            id: d.id,
            name: d.name,
            lastSeenAt: d.lastSeenAt,
          }))}
        />

        <SettingsEditor
          scopeType="household"
          scopeId={parent.householdId}
          effective={policy}
          overriddenSections={Object.keys(overrides)}
        />

        <div>
          <h2 className="mb-1 text-lg font-semibold">Notifications</h2>
          <p className="mb-4 text-sm text-ink-400">
            Nudges toward follow-through. Nothing in the system depends on you
            seeing one.
          </p>

          <div className="space-y-4">
            {!notificationsReady && (
              <Alert tone="warning">
                Set a public HTTPS URL and a push contact above first. Apple
                validates the contact and rejects anything that is not a{" "}
                <code>mailto:</code> address or an <code>https://</code> URL.
              </Alert>
            )}

            <Card>
              <h3 className="mb-1 font-semibold">This device</h3>
              <p className="mb-4 text-sm text-ink-400">
                You have {pushDeviceCount} device{pushDeviceCount === 1 ? "" : "s"}{" "}
                subscribed.
              </p>
              <PushSetup vapidPublicKey={vapidKeys.publicKey} />
              <div className="mt-4">
                <TestButton />
              </div>
            </Card>

            <Card>
              <h3 className="mb-1 font-semibold">What to send</h3>
              <p className="mb-4 text-xs text-ink-400">
                The shortfall warning is the one that matters most —
                &ldquo;rent is due in 3 days, you have $12, you need $15&rdquo;
                is where planning ahead actually gets learned.
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
        </div>

        <div>
          <h2 className="mb-1 text-lg font-semibold">Backups</h2>
          <p className="mb-4 text-sm text-ink-400">
            A consistent snapshot is written nightly at{" "}
            {String(config.backupCronHour).padStart(2, "0")}:00 and kept for{" "}
            {config.backupRetentionDays} days. Each file is a complete database —
            copy one anywhere and it opens.
          </p>

          <div className="space-y-4">
            <BackupControls />

            <Card>
              <h3 className="mb-3 font-semibold">Existing snapshots</h3>
              {backups.length === 0 ? (
                <Alert tone="info">No snapshots yet. The first one runs tonight.</Alert>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {backups.slice(0, 10).map((b) => (
                    <li key={b.name} className="flex justify-between">
                      <span className="tnum text-ink-500 dark:text-ink-300">{b.name}</span>
                      <span className="tnum text-ink-400">{formatBytes(b.sizeBytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
