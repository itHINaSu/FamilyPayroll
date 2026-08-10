"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TABS, activeTab } from "./tabs-data";

/**
 * The five screens one tap away at all times, on a phone — desktop gets the
 * same set as a row in the header instead (TopTabs), since a bar fixed to
 * the bottom of a wide window isn't a pattern anyone expects there.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const active = activeTab(pathname);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 px-1 backdrop-blur
        md:hidden dark:border-ink-700 dark:bg-ink-800/95"
      // The safe-area inset alone clears the home-indicator bar but not the
      // screen's own rounded bottom corners — the outer two tabs sit right
      // in that curve without a little extra breathing room on top of it.
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      <div className="mx-auto flex max-w-5xl">
        {TABS.map((tab) => {
          const isActive = tab.href === active;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition"
            >
              <Icon
                className={`h-5 w-5 ${
                  isActive
                    ? "text-ledger-600 dark:text-ledger-500"
                    : "text-ink-400 dark:text-ink-500"
                }`}
              />
              <span
                className={
                  isActive
                    ? "font-medium text-ink-900 dark:text-white"
                    : "text-ink-400 dark:text-ink-500"
                }
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
