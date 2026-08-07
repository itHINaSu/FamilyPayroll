import { and, eq } from "drizzle-orm";

import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { houseRule, privilege, trustArea } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { areaMembers } from "@/lib/trust";
import { AddAreaLink, AreaCard } from "./forms";

export const dynamic = "force-dynamic";

/**
 * Directly editable, area by area — no separate "add" panel to lose track
 * of. Each area owns its own rules and privileges, so the add/edit controls
 * for both live right where the list already is; "Edit area" is the one
 * control that reaches outside the area itself, to decide which children it
 * applies to.
 */
export default async function ExpectationsPage() {
  const parent = await requireParent();

  const areas = db
    .select()
    .from(trustArea)
    .where(and(eq(trustArea.householdId, parent.householdId), eq(trustArea.active, true)))
    .orderBy(trustArea.sortOrder)
    .all();

  const rules = db
    .select()
    .from(houseRule)
    .where(and(eq(houseRule.householdId, parent.householdId), eq(houseRule.active, true)))
    .orderBy(houseRule.sortOrder)
    .all();

  const privileges = db
    .select()
    .from(privilege)
    .where(and(eq(privilege.householdId, parent.householdId), eq(privilege.active, true)))
    .orderBy(privilege.sortOrder)
    .all();

  const children = listChildren(parent.householdId).map((c) => ({
    id: c.id,
    displayName: c.displayName,
  }));

  return (
    <>
      <PageHeader
        title="Expectations"
        subtitle="Never scored, never paid. These are what it means to be a member of this family."
      />

      <Alert tone="info">
        Being a decent person is not something anyone gets paid for. These sit
        alongside the paid work deliberately, so the difference is visible — they
        affect what a child is <em>trusted</em> with, never what they earn.
      </Alert>

      <div className="mt-6 space-y-6">
        {areas.map((area) => (
          <AreaCard
            key={area.id}
            area={{ id: area.id, name: area.name, icon: area.icon }}
            rules={rules
              .filter((r) => r.trustAreaId === area.id)
              .map((r) => ({ id: r.id, text: r.text, defaultWeight: r.defaultWeight }))}
            privileges={privileges
              .filter((p) => p.trustAreaId === area.id)
              .map((p) => ({ id: p.id, name: p.name, minLevel: p.minLevel }))}
            childList={children}
            members={areaMembers(area.id)}
          />
        ))}

        {areas.length === 0 && (
          <Alert tone="info">No areas yet. Add the first one below.</Alert>
        )}

        <AddAreaLink />
      </div>
    </>
  );
}
