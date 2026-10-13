import Link from "next/link";

/** Any unknown address: say so, and always offer the way back. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">That page doesn&apos;t exist</h1>
      <p className="text-sm text-ink-400">The link may be old, or the page may have moved.</p>
      <Link
        href="/"
        className="rounded-lg bg-ledger-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ledger-500"
      >
        Back to Dashboard
      </Link>
    </main>
  );
}
