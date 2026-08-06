import { Alert, Card, PageHeader } from "@/components/ui";
import { SettingsEditor } from "@/components/settings-editor";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { listBackups } from "@/lib/backup";
import { heldFundTotal } from "@/lib/bills";
import { config } from "@/lib/config";
import { formatCents } from "@/lib/money";
import { checkGuardrails, getOverrides, resolveHouseholdPolicy } from "@/lib/policy";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { device } from "@/db/schema";
import { HouseholdForm } from "./household-form";
import { KioskForm } from "./kiosk-form";

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

  const devices = db
    .select()
    .from(device)
    .where(and(eq(device.householdId, parent.householdId), eq(device.active, true)))
    .all();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Household defaults. Every one of these can be overridden per child."
      />

      <div className="space-y-6">
        {warnings.map((w) => (
          <Alert key={w.field} tone="warning">
            {w.message}
          </Alert>
        ))}

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

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Backups</h2>
          <p className="mb-4 text-sm text-ink-400">
            A consistent snapshot is written nightly at{" "}
            {String(config.backupCronHour).padStart(2, "0")}:00 and kept for{" "}
            {config.backupRetentionDays} days. Each file is a complete database —
            copy one anywhere and it opens.
          </p>

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
    </>
  );
}
