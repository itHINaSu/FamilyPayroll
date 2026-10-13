"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { openAppMenu } from "./app-menu";
import { TABS, activeTab } from "./tabs-data";

/**
 * The five screens one tap away at all times, on a phone — desktop gets the
 * same set as a row in the header instead (TopTabs), since a bar fixed to
 * the bottom of a wide window isn't a pattern anyone expects there.
 */
export function BottomTabs({ pendingJobs = 0 }: { pendingJobs?: number }) {
  const pathname = usePathname();
  const active = activeTab(pathname);

  return (
    <nav
      aria-label="Primary"
      // Positioning/spacing lives in globals.css (.bottom-tab-bar) rather
      // than inline styles, since the extra clearance needed on an
      // installed PWA vs. an ordinary browser tab only differs by a
      // `@media (display-mode: standalone)` query — not expressible inline.
      className="bottom-tab-bar fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95
        backdrop-blur md:hidden dark:border-ink-700 dark:bg-ink-800/95"
    >
      <div className="mx-auto flex max-w-5xl">
        {TABS.map((tab) => {
          const isActive = tab.href === active;
          const Icon = tab.icon;
          const body = (
            <>
              <span className="relative">
                <Icon
                  className={`h-5 w-5 ${
                    isActive
                      ? "text-ledger-600 dark:text-ledger-500"
                      : "text-ink-400 dark:text-ink-500"
                  }`}
                />
                {tab.href === "/settings" && pendingJobs > 0 && (
                  <span
                    aria-label={`${pendingJobs} waiting on you`}
                    className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white dark:ring-ink-800"
                  />
                )}
              </span>
              <span
                className={
                  isActive
                    ? "font-medium text-ink-900 dark:text-white"
                    : "text-ink-400 dark:text-ink-500"
                }
              >
                {tab.label}
              </span>
            </>
          );
          const cls = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition";

          // On a phone, Settings opens the side menu (settings and setup
          // links) instead of a page.
          return tab.href === "/settings" ? (
            <button
              key={tab.href}
              type="button"
              onClick={openAppMenu}
              aria-haspopup="dialog"
              className={cls}
            >
              {body}
            </button>
          ) : (
            <Link key={tab.href} href={tab.href} className={cls}>
              {body}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
