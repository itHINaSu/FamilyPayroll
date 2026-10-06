import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, getChild } from "@/lib/children";
import { ChildTabs } from "./child-tabs";

export const dynamic = "force-dynamic";

export default async function ChildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();

  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  return (
    <>
      <PageHeader
        title={record.displayName}
        subtitle={`${ageFromBirthdate(record.birthdate)} years old · born ${record.birthdate}`}
        action={
          <Link href="/balances" className="text-sm text-ink-400 hover:underline">
            ← Balances
          </Link>
        }
      />
      <ChildTabs childId={childId} />
      {children}
    </>
  );
}
