"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Money" },
  { slug: "responsibilities", label: "Responsibilities" },
  { slug: "pay", label: "Pay stubs" },
  { slug: "bills", label: "Bills" },
  { slug: "goals", label: "Goals" },
  { slug: "trust", label: "Trust" },
  { slug: "settings", label: "Settings" },
];

export function ChildTabs({ childId }: { childId: string }) {
  const pathname = usePathname();
  const base = `/children/${childId}`;

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-ink-700">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug
          ? pathname.startsWith(href)
          : pathname === base;

        return (
          <Link
            key={tab.slug}
            href={href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-ledger-600 text-ledger-600 dark:text-ledger-500"
                : "border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-ink-100"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
