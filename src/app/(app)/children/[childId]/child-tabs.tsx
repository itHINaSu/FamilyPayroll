"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BackChevron } from "@/components/ui";

import { GearIcon } from "../../icons";

// Short labels so the whole strip fits a phone without sideways scrolling.
const TABS = [
  { slug: "", label: "Money" },
  { slug: "responsibilities", label: "Expectations" },
  { slug: "pay", label: "Pay" },
  { slug: "bills", label: "Bills" },
  { slug: "goals", label: "Goals" },
];

export function ChildTabs({ childId }: { childId: string }) {
  const pathname = usePathname();
  const base = `/children/${childId}`;

  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition sm:flex-none sm:px-3 ${
      active
        ? "border-ledger-600 text-ledger-600 dark:text-ledger-500"
        : "border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-ink-100"
    }`;

  const settingsHref = `${base}/settings`;

  return (
    <nav className="mb-6 flex overflow-x-auto border-b border-ink-200 dark:border-ink-700 sm:gap-1">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link key={tab.slug} href={href} className={tabClass(active)}>
            {tab.label}
          </Link>
        );
      })}
      <Link
        href={settingsHref}
        aria-label="Settings"
        title="Settings"
        className={`${tabClass(pathname.startsWith(settingsHref))} sm:ml-auto`}
      >
        <GearIcon className="h-5 w-5" />
      </Link>
    </nav>
  );
}

/** Back to whichever tab this child page belongs to. */
export function ChildBackLink({ childId }: { childId: string }) {
  const pathname = usePathname();
  const base = `/children/${childId}`;
  const [href, label] = pathname.startsWith(`${base}/responsibilities`)
    ? ["/expectations", "Expectations"]
    : ["/balances", "Balances"];

  return (
    <Link href={href} title={label}>
      <BackChevron label={label} />
    </Link>
  );
}
