"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, Card } from "@/components/ui";

/**
 * If a page fails, say so — with a way to retry and a way out — rather than
 * leaving a tap looking like it did nothing.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-md text-center">
      <h2 className="mb-1 text-lg font-semibold">This page didn&apos;t load</h2>
      <p className="mb-4 text-sm text-ink-400">
        Something went wrong on the server or in the app.
        {error.digest && (
          <span className="mt-1 block text-xs">
            Reference: <code>{error.digest}</code>
          </span>
        )}
      </p>
      <div className="flex justify-center gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/"
          className="rounded-lg bg-ink-100 px-4 py-2 text-sm font-medium text-ink-700 dark:bg-ink-700 dark:text-ink-100"
        >
          Dashboard
        </Link>
      </div>
    </Card>
  );
}
