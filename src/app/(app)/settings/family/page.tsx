import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { listPendingInvites } from "@/lib/invites";
import { HouseholdForm } from "../household-form";
import { ParentsForm } from "../parents-form";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

export default async function FamilySettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();
  const parents = db
    .select()
    .from(user)
    .where(and(eq(user.householdId, parent.householdId), eq(user.role, "parent")))
    .all();
  const pendingInvites = listPendingInvites(parent.householdId, "parent");

  return (
    <>
      <SectionHeader title="Household and parents" />
      <div className="mx-auto max-w-2xl space-y-6">
        <HouseholdForm
          household={{
            name: home?.name ?? "",
            timezone: home?.timezone ?? "UTC",
            appUrl: home?.appUrl ?? "",
            vapidContact: home?.vapidContact ?? "",
          }}
        />
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
      </div>
    </>
  );
}
