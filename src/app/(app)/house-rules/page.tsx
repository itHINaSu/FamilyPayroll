import { and, eq } from "drizzle-orm";

import { Alert, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { houseRule, privilege, trustArea } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { TRUST_LEVELS } from "@/lib/trust";
import { archiveArea, archivePrivilege, archiveRule } from "./actions";
import { AddAreaForm, AddPrivilegeForm, AddRuleForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function HouseRulesPage() {
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

  return (
    <>
      <PageHeader
        title="House rules"
        subtitle="Never scored, never paid. These are what it means to be a member of this family."
      />

      <Alert tone="info">
        Being a decent person is not something anyone gets paid for. These sit
        alongside the paid work deliberately, so the difference is visible — they
        affect what a child is <em>trusted</em> with, never what they earn.
      </Alert>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {areas.map((area) => {
            const areaRules = rules.filter((r) => r.trustAreaId === area.id);
            const areaPrivileges = privileges.filter((p) => p.trustAreaId === area.id);

            return (
              <Card key={area.id}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {area.icon && <span className="mr-2">{area.icon}</span>}
                    {area.name}
                  </h2>
                  <form action={archiveArea}>
                    <input type="hidden" name="areaId" value={area.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
                    >
                      Remove area
                    </button>
                  </form>
                </div>

                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Rules
                </p>
                <ul className="mb-5 space-y-1.5 text-sm">
                  {areaRules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3">
                      <span>{r.text}</span>
                      <span className="flex items-center gap-3">
                        <span className="tnum text-xs text-ink-400">
                          {r.defaultWeight} pt{r.defaultWeight === 1 ? "" : "s"}
                        </span>
                        <form action={archiveRule}>
                          <input type="hidden" name="ruleId" value={r.id} />
                          <button
                            type="submit"
                            className="text-xs text-ink-400 hover:text-ink-700"
                          >
                            ✕
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                  {areaRules.length === 0 && (
                    <li className="text-ink-400">No rules in this area yet.</li>
                  )}
                </ul>

                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Privileges
                </p>
                <ul className="space-y-1.5 text-sm">
                  {areaPrivileges.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span>{p.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-ink-400">
                          needs{" "}
                          {TRUST_LEVELS.find((l) => l.level === p.minLevel)?.name}
                        </span>
                        <form action={archivePrivilege}>
                          <input type="hidden" name="privilegeId" value={p.id} />
                          <button
                            type="submit"
                            className="text-xs text-ink-400 hover:text-ink-700"
                          >
                            ✕
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                  {areaPrivileges.length === 0 && (
                    <li className="text-ink-400">Nothing tied to this area yet.</li>
                  )}
                </ul>
              </Card>
            );
          })}

          {areas.length === 0 && (
            <Alert tone="info">No areas yet. Add the first one on the right.</Alert>
          )}
        </div>

        <div className="space-y-6">
          <AddRuleForm areas={areas.map((a) => ({ id: a.id, name: a.name }))} />
          <AddPrivilegeForm areas={areas.map((a) => ({ id: a.id, name: a.name }))} />
          <AddAreaForm />
        </div>
      </div>
    </>
  );
}
