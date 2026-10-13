/** Shown the instant a child tab is tapped, while that page loads. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-xl border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800"
        />
      ))}
    </div>
  );
}
