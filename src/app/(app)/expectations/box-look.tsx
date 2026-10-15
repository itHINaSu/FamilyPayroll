import type { Box } from "@/lib/responsibilities";

/**
 * How a day (or numbered) box looks in each state — shared by the tappable
 * boxes on the Expectations tab and the small read-only ones on the
 * Dashboard, so the two always read as the same thing at different sizes.
 */
export function boxLook(box: Box): string {
  const checked = box.state === "met" || box.state === "done";
  const colour =
    box.state === "excused"
      ? "border-ink-200 bg-ink-100 text-ink-400 dark:border-ink-700 dark:bg-ink-700"
      : checked
        ? "border-ledger-600 bg-ledger-600 text-white"
        : box.state === "missed"
          ? "border-red-400 bg-red-50 text-red-300 dark:border-red-500 dark:bg-red-950/40 dark:text-red-400/60"
          : "border-ink-300 bg-white text-ink-400 dark:border-ink-600 dark:bg-ink-900";
  return `${colour} ${box.future ? "opacity-40" : ""}`;
}

export const TODAY_RING = "ring-2 ring-ledger-500/40 ring-offset-1 dark:ring-offset-ink-800";

/** The red X drawn over a missed box. */
export function MissedX() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="absolute inset-0 m-auto h-4/5 w-4/5 text-red-500"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}
