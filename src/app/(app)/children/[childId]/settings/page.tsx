import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { Alert, Button, Card } from "@/components/ui";
import { SettingsEditor } from "@/components/settings-editor";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, getChild } from "@/lib/children";
import { pendingInviteForChild } from "@/lib/invites";
import { checkGuardrails, getOverrides, resolvePolicy } from "@/lib/policy";
import { clearChildOverrides } from "@/app/(app)/settings/actions";
import { ChildLoginForm } from "./child-login-form";
import { EditChildForm } from "../edit-child-form";

export const dynamic = "force-dynamic";

export default async function ChildSettingsPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const policy = resolvePolicy(parent.householdId, childId);
  const overrides = getOverrides("child", childId);
  const overriddenSections = Object.keys(overrides);
  const warnings = checkGuardrails(policy, ageFromBirthdate(record.birthdate));

  const existingLogin = db
    .select()
    .from(user)
    .where(and(eq(user.childId, childId), eq(user.role, "child")))
    .get();
  const hasPendingInvite = !!pendingInviteForChild(childId);

  return (
    <div className="space-y-6">
      {warnings.map((w) => (
        <Alert key={w.field} tone="warning">
          {w.message}
        </Alert>
      ))}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Overrides</h2>
                <p className="mt-1 text-xs text-ink-400">
                  {overriddenSections.length === 0
                    ? "Following every household default."
                    : `Diverging from the household in: ${overriddenSections.join(", ")}.`}
                </p>
              </div>
              {overriddenSections.length > 0 && (
                <form action={clearChildOverrides}>
                  <input type="hidden" name="childId" value={childId} />
                  <Button type="submit" variant="secondary">
                    Back to defaults
                  </Button>
                </form>
              )}
            </div>
          </Card>

          <SettingsEditor
            scopeType="child"
            scopeId={childId}
            effective={policy}
            overriddenSections={overriddenSections}
          />

          <ChildLoginForm
            childId={childId}
            childName={record.displayName}
            existingLogin={
              existingLogin
                ? { id: existingLogin.id, email: existingLogin.email, active: existingLogin.active }
                : null
            }
            hasPendingInvite={hasPendingInvite}
          />
        </div>

        <EditChildForm
          child={{
            id: record.id,
            displayName: record.displayName,
            birthdate: record.birthdate,
            status: record.status,
            photoBlobId: record.photoBlobId,
          }}
        />
      </div>
    </div>
  );
}
