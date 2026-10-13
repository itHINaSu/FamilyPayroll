import type { ComponentProps, ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      // Less padding on a phone: 24px on each side of every card was real
      // width lost on a 320-375px screen, on top of the page's own padding.
      className={`rounded-xl border border-ink-200 bg-white p-4 shadow-sm sm:p-6 dark:border-ink-700 dark:bg-ink-800 ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1.5 block text-xs text-ink-400">{hint}</span>
      )}
      {error && (
        <span className="mt-1.5 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-ink-900 " +
  "outline-none transition focus:border-ledger-500 focus:ring-2 focus:ring-ledger-500/20 " +
  "dark:border-ink-600 dark:bg-ink-900 dark:text-ink-50";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  // A plain <select> keeps the OS's own dropdown chrome no matter how the
  // element itself is styled — appearance-none turns that off, and this
  // draws a matching chevron back on so it still reads as a dropdown.
  return (
    <div className="relative">
      <select
        {...props}
        className={`${inputClass} appearance-none pr-9 ${props.className ?? ""}`}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary:
      "bg-ledger-600 text-white hover:bg-ledger-500 focus:ring-ledger-500/40",
    secondary:
      "bg-ink-100 text-ink-700 hover:bg-ink-200 focus:ring-ink-400/40 " +
      "dark:bg-ink-700 dark:text-ink-100 dark:hover:bg-ink-600",
    danger: "bg-red-600 text-white hover:bg-red-500 focus:ring-red-500/40",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium
        transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50
        ${variants[variant]} ${className}`}
    />
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "warning";
  children: ReactNode;
}) {
  const tones = {
    error:
      "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
    info: "border-ink-300 bg-ink-100 text-ink-700 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-200",
    warning:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  action,
  back,
}: {
  title: string;
  /** Accepted for older callers; not rendered. */
  subtitle?: string;
  /** Right side of the band. */
  action?: ReactNode;
  /** Left side of the band — a way back, usually <BackLink>. */
  back?: ReactNode;
}) {
  return (
    // The app's title bar: a full-width green band on a phone (the
    // installed app has no other header), a rounded one on wider screens.
    <div
      className="-mx-4 -mt-8 mb-5 grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1 bg-ledger-600
        px-2 py-4 text-white sm:-mx-6 sm:px-4 md:mx-0 md:mt-0 md:rounded-xl"
    >
      <div className="justify-self-start text-white/85">{back}</div>
      <h1 className="text-center text-xl font-semibold tracking-tight text-balance">{title}</h1>
      <div className="justify-self-end">{action}</div>
    </div>
  );
}

/** The chevron in a page's title band that goes back up a level. */
export function BackChevron({ label }: { label: string }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="sr-only">Back to {label}</span>
    </span>
  );
}
