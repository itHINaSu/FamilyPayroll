import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Family Payroll",
  description: "Earn it. Save it. Share it. Every dollar has a job.",
  applicationName: "Family Payroll",
  appleWebApp: {
    capable: true,
    title: "Family Payroll",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Parents run this one-handed at a checkout counter; the kiosk is a wall
  // tablet. Both want a stable viewport rather than pinch-zoom.
  maximumScale: 1,
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
