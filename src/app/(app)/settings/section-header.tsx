import Link from "next/link";

import { PageHeader } from "@/components/ui";

/** Title for a Settings sub-page, with the way back. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <>
      <Link href="/settings" className="tap mb-2 inline-block text-sm text-ink-400 hover:underline">
        ← Settings
      </Link>
      <PageHeader title={title} />
    </>
  );
}
