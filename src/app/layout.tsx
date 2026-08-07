import type { Metadata, Viewport } from "next";

import "./globals.css";

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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Locking maximumScale to 1 was wrong: it disables pinch-zoom entirely,
  // which is a real accessibility regression (WCAG 1.4.4) once this is a
  // phone app parents use daily, not just a one-off checkout tool. Zoom stays
  // available; only the initial layout is fixed.
  themeColor: "#23272f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
