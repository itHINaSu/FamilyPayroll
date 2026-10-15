/** A child's photo, or their initial when there isn't one. */
export function Avatar({
  name,
  photoBlobId,
  size = "md",
}: {
  name: string;
  photoBlobId: string | null;
  size?: "xs" | "sm" | "md";
}) {
  const box = size === "xs" ? "h-6 w-6 text-xs" : size === "sm" ? "h-8 w-8 text-sm" : "h-11 w-11";
  return photoBlobId ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/blobs/${photoBlobId}`}
      alt=""
      className={`${box} flex-shrink-0 rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${box} flex flex-shrink-0 items-center justify-center rounded-full bg-ink-100 font-semibold text-ink-400 dark:bg-ink-700`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
