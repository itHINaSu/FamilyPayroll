import { NextResponse } from "next/server";

import { sqlite } from "@/db";
import { isSetupComplete } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Container healthcheck. Touches SQLite so an unreadable database reports
 * unhealthy rather than serving errors to a browser.
 */
export function GET() {
  try {
    sqlite.prepare("SELECT 1").get();
    return NextResponse.json({
      status: "ok",
      setupComplete: isSetupComplete(),
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
