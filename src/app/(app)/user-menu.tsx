"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { logout } from "@/app/login/actions";

/**
 * The account corner.
 *
 * A bare "Sign out" link used to sit here on its own — the only place a
 * parent's own account was reachable at all was that one word. This folds it
 * into a small menu behind an avatar-style button instead, with "My account"
 * (the Settings page's account section) alongside it, and frees up header
 * width on a phone in the process.
 */
export function UserMenu({
  displayName,
  householdName,
}: {
  displayName: string;
  householdName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600 transition hover:bg-ink-200 dark:bg-ink-700 dark:text-ink-200 dark:hover:bg-ink-600"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 text-sm shadow-lg dark:border-ink-700 dark:bg-ink-800"
        >
          <div className="border-b border-ink-100 px-3 py-2 dark:border-ink-700">
            <p className="truncate font-medium">{displayName}</p>
            {householdName && (
              <p className="truncate text-xs text-ink-400">{householdName}</p>
            )}
          </div>

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-ink-600 transition hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-700"
          >
            My account
          </Link>

          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-ink-600 transition hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-700"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
