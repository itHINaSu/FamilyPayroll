"use client";

import { useId, useState, type ComponentProps } from "react";

/**
 * A native `<input type="file">` cannot be restyled directly — every
 * browser keeps its own "Choose File" button regardless of CSS, which is
 * the single most "this is a web page" element in the app. This hides the
 * native control (still fully keyboard- and screen-reader-accessible via
 * the paired label) behind a button that matches everything else, and
 * shows the chosen filename next to it.
 */
export function FileInput({
  label = "Choose file",
  className = "",
  onChange,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label?: string }) {
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <label
        htmlFor={id}
        className="cursor-pointer rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm
          font-medium text-ink-700 transition hover:bg-ink-50 dark:border-ink-600 dark:bg-ink-900
          dark:text-ink-100 dark:hover:bg-ink-800"
      >
        {label}
      </label>
      <input
        {...props}
        id={id}
        type="file"
        className="sr-only"
        onChange={(e) => {
          setFileName(e.target.files?.[0]?.name ?? null);
          onChange?.(e);
        }}
      />
      <span className="truncate text-sm text-ink-400">
        {fileName ?? "No file chosen"}
      </span>
    </div>
  );
}
