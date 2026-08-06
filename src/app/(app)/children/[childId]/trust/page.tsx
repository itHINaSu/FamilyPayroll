import { notFound } from "next/navigation";

import { Alert, Card } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, getChild } from "@/lib/children";
import { checkGuardrails, resolvePolicy } from "@/lib/policy";
import {
  currentFocusNote,
  listHouseRules,
  listMarks,
  privilegesFor,
  trustSummary,
} from "@/lib/trust";
import { AreaCard, FocusNoteForm, MarkForm, MarkHistory } from "./forms";

export const dynamic = "force-dynamic";

export default async function TrustPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const policy = resolvePolicy(parent.householdId, childId);
  const areas = trustSummary(childId);
  const rules = listHouseRules(parent.householdId);
  const marks = listMarks(childId, 25);
  const privileges = privilegesFor(childId);
  const note = currentFocusNote(childId);

  const warnings = checkGuardrails(policy, ageFromBirthdate(record.birthdate)).filter(
    (w) => w.field === "trust",
  );

  if (!policy.trust.enabled) {
    return <Alert tone="info">Trust is turned off for this child in settings.</Alert>;
  }

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Trust decides what {record.displayName} is trusted with — never what they
        are paid. Nothing on this page touches money, and none of it appears on the
        shared kiosk.
      </Alert>

      {warnings.map((w) => (
        <Alert key={w.field} tone="warning">
          {w.message}
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <AreaCard key={area.areaId} area={area} childId={childId} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Ready for right now</h2>
            <p className="mb-4 text-xs text-ink-400">
              The app says what they are ready for. It does not switch anything
              off — that is still your conversation to have.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ledger-600">
                  Ready
                </p>
                <ul className="space-y-1 text-sm">
                  {privileges.ready.map((p) => (
                    <li key={p.name}>{p.name}</li>
                  ))}
                  {privileges.ready.length === 0 && (
                    <li className="text-ink-400">Nothing right now.</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Not yet
                </p>
                <ul className="space-y-1 text-sm">
                  {privileges.notYet.map((p) => (
                    <li key={p.name}>
                      {p.name}
                      <span className="block text-xs text-ink-400">
                        needs {p.needs}
                      </span>
                    </li>
                  ))}
                  {privileges.notYet.length === 0 && (
                    <li className="text-ink-400">Everything is available.</li>
                  )}
                </ul>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Recent marks</h2>
            <MarkHistory
              childId={childId}
              marks={marks.map((m) => ({
                id: m.mark.id,
                weight: m.mark.weight,
                note: m.mark.note,
                areaName: m.area.name,
                ruleText: m.rule?.text ?? null,
                occurredAt: m.mark.occurredAt,
                retracted: !!m.mark.retractedAt,
              }))}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <MarkForm
            childId={childId}
            areas={areas.map((a) => ({ id: a.areaId, name: a.areaName }))}
            rules={rules.map((r) => ({
              id: r.rule.id,
              text: r.rule.text,
              weight: r.rule.defaultWeight,
              areaId: r.area.id,
            }))}
          />
          <FocusNoteForm childId={childId} current={note?.text ?? ""} />
        </div>
      </div>
    </div>
  );
}
