"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Daily use first, configuration in one place.
 *
 * Jobs, house rules, notifications, and settings were four separate top-level
 * links next to Today — flattening the rare next to the daily, which is a good
 * bit of why the whole app read as more to set up than it is. They now live
 * under one "Setup" link (→ /config), grouped as a landing page rather than a
 * dropdown so each is still one click away, just not sharing a shelf with
 * Today and Children.
 */
const SETUP_PATHS = ["/config", "/jobs", "/house-rules", "/notifications", "/settings"];

const NAV = [
  { href: "/", label: "Today" },
  { href: "/children", label: "Children" },
  { href: "/config", label: "Setup" },
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
            // header's height — links are otherwise just inline text, and
            // "Today" three characters wide is an easy mis-tap on a phone.
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
