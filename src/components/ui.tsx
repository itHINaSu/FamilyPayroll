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
      className={`rounded-xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-800 ${className}`}
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

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
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
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
