import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { listPendingInvites, pendingInviteForChild } from "@/lib/invites";
import { HouseholdForm } from "../household-form";
import { SectionHeader } from "../section-header";
import { UsersForm } from "../users-form";

export const dynamic = "force-dynamic";

export default async function HouseholdSettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();

  const logins = db.select().from(user).where(eq(user.householdId, parent.householdId)).all();
  const parents = logins.filter((u) => u.role === "parent");
  const childLogins = logins.filter((u) => u.role === "child");

  return (
    <>
      <SectionHeader title="Household" />
      <div className="mx-auto max-w-2xl space-y-6">
        <HouseholdForm
          household={{
            name: home?.name ?? "",
            timezone: home?.timezone ?? "UTC",
            appUrl: home?.appUrl ?? "",
            vapidContact: home?.vapidContact ?? "",
          }}
        />
        <UsersForm
          parents={parents.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            username: p.email,
            active: p.active,
          }))}
          parentInvites={listPendingInvites(parent.householdId, "parent").map((i) => ({
            id: i.id,
            expiresAt: i.expiresAt,
          }))}
          kids={listChildren(parent.householdId).map((c) => {
            const login = childLogins.find((u) => u.childId === c.id);
            return {
              id: c.id,
              name: c.displayName,
              login: login ? { id: login.id, username: login.email, active: login.active } : null,
              invitePending: !!pendingInviteForChild(c.id),
            };
          })}
          selfId={parent.id}
        />
      </div>
    </>
  );
}
