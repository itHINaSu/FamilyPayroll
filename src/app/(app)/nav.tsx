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
    <nav className="flex gap-4 text-sm">
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
            className={`transition ${
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
