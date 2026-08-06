import { redirect } from "next/navigation";

import { isSetupComplete } from "@/lib/auth/guard";
import { config } from "@/lib/config";
import { SetupForm } from "./setup-form";

/**
 * Never prerendered: this page reads the session cookie and the database, both
 * of which only exist at request time. Without this, `next build` would bake a
 * snapshot of an empty database into the image.
 */
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (isSetupComplete()) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Family Payroll</h1>
        <p className="mt-2 text-sm text-ink-400">
          Earn it. Save it. Share it. Every dollar has a job.
        </p>
      </div>
      <SetupForm defaultTimezone={config.timezone} />
    </main>
  );
}
