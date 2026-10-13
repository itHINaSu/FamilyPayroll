import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { AccountForm } from "../account-form";
import { MfaForm } from "../mfa-form";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const parent = await requireParent();
  const account = db.select().from(user).where(eq(user.id, parent.id)).get();

  return (
    <>
      <SectionHeader title="Account" />
      <div className="mx-auto max-w-2xl space-y-6">
        <AccountForm
          account={{ displayName: account?.displayName ?? "", email: account?.email ?? "" }}
        />
        <MfaForm enabled={!!account?.totpEnabledAt} />
      </div>
    </>
  );
}
