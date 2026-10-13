import { and, eq } from "drizzle-orm";

import { SettingsEditor } from "@/components/settings-editor";
import { db } from "@/db";
import { device } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getOverrides, resolveHouseholdPolicy } from "@/lib/policy";
import { KioskForm } from "../kiosk-form";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

export default async function DisplaySettingsPage() {
  const parent = await requireParent();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const overrides = getOverrides("household", parent.householdId);
  const devices = db
    .select()
    .from(device)
    .where(and(eq(device.householdId, parent.householdId), eq(device.active, true)))
    .all();

  return (
    <>
      <SectionHeader title="Display and kiosk" />
      <div className="mx-auto max-w-2xl space-y-6">
        <SettingsEditor
          scopeType="household"
          scopeId={parent.householdId}
          effective={policy}
          overriddenSections={Object.keys(overrides)}
          sections={["display", "kiosk"]}
        />
        <KioskForm
          devices={devices.map((d) => ({ id: d.id, name: d.name, lastSeenAt: d.lastSeenAt }))}
        />
      </div>
    </>
  );
}
