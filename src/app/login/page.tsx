import { redirect } from "next/navigation";

import { getHousehold, isSetupComplete } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

/**
 * Never prerendered: this page reads the session cookie and the database, both
 * of which only exist at request time. Without this, `next build` would bake a
 * snapshot of an empty database into the image.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isSetupComplete()) redirect("/setup");
  if (await getSessionUser()) redirect("/");

  const home = getHousehold();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Family Payroll</h1>
        <p className="mt-2 text-sm text-ink-400">{home?.name}</p>
      </div>
      <LoginForm />
    </main>
  );
}
