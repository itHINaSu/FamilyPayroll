"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TABS, activeTab } from "./tabs-data";

/**
 * Desktop's version of the same tab set as BottomTabs — a fixed bar glued
 * to the bottom of a wide browser window isn't a pattern anyone expects
 * there, so this sits in the header instead: same five destinations, same
 * icons, laid out as a horizontal row of pill tabs.
 */
export function TopTabs() {
  const pathname = usePathname();
  const active = activeTab(pathname);

  return (
    <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-1">
      {TABS.map((tab) => {
        const isActive = tab.href === active;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? "bg-ledger-100 text-ledger-700 dark:bg-ledger-600/20 dark:text-ledger-400"
                : "text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
