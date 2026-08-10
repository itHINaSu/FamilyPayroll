import type { Metadata, Viewport } from "next";

import "./globals.css";
import { THEME_COLORS, THEME_STORAGE_KEY } from "./theme";

// Runs before paint (a plain inline <script>, first thing in <body>, is
// render-blocking) so the page never flashes light-then-dark or vice versa.
// Resolves, in order: a stored explicit choice from the theme toggle, then
// falls back to the OS preference — "follow the system" is still the
// default until someone actually uses the toggle.
const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);var c=${JSON.stringify(THEME_COLORS)};var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[t]);}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Family Payroll",
  description: "Earn it. Save it. Share it. Every dollar has a job.",
  applicationName: "Family Payroll",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Family Payroll",
    statusBarStyle: "default",
  },
  other: {
    // Next's `appleWebApp.capable` only renders the newer, unprefixed
    // "mobile-web-app-capable" tag — iOS Safari still ignores that one and
    // only honors this Apple-prefixed name for standalone (no URL bar, no
    // browser buttons) launch from a home-screen icon. Without it, "Add to
    // Home Screen" just opens a bookmark in ordinary Safari.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Locking maximumScale to 1 was wrong: it disables pinch-zoom entirely,
  // which is a real accessibility regression (WCAG 1.4.4) once this is a
  // phone app parents use daily, not just a one-off checkout tool. Zoom stays
  // available; only the initial layout is fixed.
  // Overwritten immediately by the init script below to match whichever
  // theme actually resolves — this is only what shows for the instant
  // before that script runs (or if it can't, e.g. JS disabled).
  themeColor: THEME_COLORS.light,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
