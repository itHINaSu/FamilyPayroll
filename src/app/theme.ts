/**
 * Shared between the no-flash init script (layout.tsx, runs before paint)
 * and the toggle in the hamburger menu (app-menu's ThemeToggle) — one
 * source for the storage key and the theme-color meta values so the two
 * can't drift out of sync with each other.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** Matches body's light/dark background (globals.css: --color-ink-50 / --color-ink-900). */
export const THEME_COLORS: Record<Theme, string> = {
  light: "#f6f7f9",
  dark: "#14171c",
};

/**
 * The installed app's status bar sits on the green title band, so there it
 * is always the brand green rather than the page background.
 */
export const STANDALONE_THEME_COLOR = "#1f6f4f";

export const STANDALONE_QUERY = "(display-mode: standalone)";
