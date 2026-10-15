import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, CHILD_STATUS_LABELS, listChildren } from "@/lib/children";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { listPendingInvites, pendingInviteForChild } from "@/lib/invites";
import { HouseholdForm } from "../household-form";
import { SectionHeader } from "../section-header";
import { ChildrenCard, ParentsCard } from "../users-form";

export const dynamic = "force-dynamic";

export default async function HouseholdSettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();

  const logins = db.select().from(user).where(eq(user.householdId, parent.householdId)).all();
  const parents = logins.filter((u) => u.role === "parent");
  const childLogins = logins.filter((u) => u.role === "child");
  const everyone = listChildren(parent.householdId, {
    includeArchived: true,
    order: resolveHouseholdPolicy(parent.householdId).display.childOrder,
  });

  return (
    <>
      <SectionHeader title="Household" />
      <div className="mx-auto max-w-2xl space-y-6">
        <ChildrenCard
          kids={everyone
            .filter((c) => c.status !== "archived")
            .map((c) => {
              const login = childLogins.find((u) => u.childId === c.id);
              return {
                id: c.id,
                name: c.displayName,
                photoBlobId: c.photoBlobId,
                detail: `${ageFromBirthdate(c.birthdate)} years old · ${CHILD_STATUS_LABELS[c.status]}`,
                login: login ? { id: login.id, username: login.email, active: login.active } : null,
                invitePending: !!pendingInviteForChild(c.id),
              };
            })}
          archived={everyone
            .filter((c) => c.status === "archived")
            .map((c) => ({ id: c.id, name: c.displayName }))}
        />
        <ParentsCard
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
      </div>
    </>
  );
}
