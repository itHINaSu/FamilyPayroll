"use client";

import { useEffect, useState } from "react";

import {
  STANDALONE_QUERY,
  STANDALONE_THEME_COLOR,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/app/theme";
import { MoonIcon, SunIcon } from "./icons";

/**
 * Light/dark, overriding whatever the OS is set to. The root layout's
 * inline script already resolves the starting value (stored choice, else
 * system preference) before paint — this only needs to read that back once
 * mounted and write through the same two places (the attribute Tailwind's
 * dark: variant matches, and the theme-color meta tag) when tapped.
 */
export function ThemeToggle() {
  // Starts null rather than reading document on the server (there is none)
  // — corrected in the effect below, which runs before the user can see or
  // interact with this, so there's nothing to visibly flash.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing, storage disabled — the choice just won't persist
      // past this session, which is a fine fallback rather than an error.
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        window.matchMedia(STANDALONE_QUERY).matches ? STANDALONE_THEME_COLOR : THEME_COLORS[next],
      );
    setTheme(next);
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-ink-700 dark:text-ink-100">
      Appearance
      <div className="ml-auto flex rounded-lg border border-ink-200 p-0.5 dark:border-ink-600">
        {(
          [
            { value: "light" as const, icon: SunIcon, label: "Light" },
            { value: "dark" as const, icon: MoonIcon, label: "Dark" },
          ]
        ).map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-pressed={theme === value}
            aria-label={label}
            title={label}
            className={`flex h-7 w-9 items-center justify-center rounded-md transition ${
              theme === value
                ? "bg-ledger-600 text-white"
                : "text-ink-400 hover:text-ink-700 dark:text-ink-500 dark:hover:text-ink-200"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
