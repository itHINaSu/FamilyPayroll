import Link from "next/link";

import { BackChevron, PageHeader } from "@/components/ui";

/** Title for a Settings sub-page, with the way back. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <PageHeader
      title={title}
      back={
        <Link href="/settings" title="Settings">
          <BackChevron label="Settings" />
        </Link>
      }
    />
  );
}
