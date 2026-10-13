import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, getChild } from "@/lib/children";
import { ChildBackLink, ChildTabs } from "./child-tabs";
import { formatShortDate } from "@/lib/dates";

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
        subtitle={`${ageFromBirthdate(record.birthdate)} years old · born ${formatShortDate(record.birthdate)}`}
        back={<ChildBackLink childId={childId} />}
      />
      <ChildTabs childId={childId} />
      {children}
    </>
  );
}
