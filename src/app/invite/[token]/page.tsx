import { eq } from "drizzle-orm";

import { Alert } from "@/components/ui";
import { db } from "@/db";
import { child, household } from "@/db/schema";
import { lookupInvite } from "@/lib/invites";
import { AcceptInviteForm } from "./accept-form";

export const dynamic = "force-dynamic";

const REASON_COPY: Record<string, string> = {
  not_found: "That invite link doesn't exist.",
  used: "That invite link has already been used.",
  expired: "That invite link has expired. Ask for a new one.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = lookupInvite(token);

  let subtitle = "Earn it. Save it. Share it. Every dollar has a job.";
  if (lookup.valid) {
    const home = db
      .select()
      .from(household)
      .where(eq(household.id, lookup.householdId))
      .get();

    if (lookup.role === "child" && lookup.childId) {
      const record = db.select().from(child).where(eq(child.id, lookup.childId)).get();
      subtitle = `A login just for ${record?.displayName ?? "you"}, on ${home?.name ?? "this household"}.`;
    } else {
      subtitle = `You've been invited to join ${home?.name ?? "this household"} as a parent.`;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Family Payroll</h1>
        <p className="mt-2 text-sm text-ink-400">{subtitle}</p>
      </div>

      {lookup.valid ? (
        <AcceptInviteForm token={token} />
      ) : (
        <Alert>{REASON_COPY[lookup.reason]}</Alert>
      )}
    </main>
  );
}
