"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Daily use first, configuration grouped, account behaviour on its own.
 *
 * Children, responsibilities, expectations, extra jobs, and bills are all
 * configured occasionally rather than used daily, and every one of them is
 * only meaningful in the context of a specific child — so they live under one
 * "Setup" link (→ /config) as a landing page, one click from the top nav and
 * still one click from there to each destination. A child's own balance and
 * history is one click from the Dashboard instead of needing its own tab.
 * Settings is different: it is not "what is set up" but "how the app
 * behaves" — pay schedule, the parent's own account, notifications — so it
 * keeps its own tab rather than sharing Setup's shelf.
 */
const SETUP_PATHS = [
  "/config",
  "/children",
  "/responsibilities",
  "/expectations",
  "/jobs",
  "/bills",
];

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/config", label: "Setup" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-3 text-sm sm:gap-4">
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : item.href === "/config"
              ? SETUP_PATHS.some((p) => pathname.startsWith(p))
              : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            // py-1 widens the tap target vertically without disturbing the
            // header's height — links are otherwise just inline text, and a
            // short label like "Children" is an easy mis-tap on a phone.
            className={`-my-1 rounded px-0.5 py-1 transition ${
              active
                ? "font-medium text-ink-900 dark:text-white"
                : "text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
