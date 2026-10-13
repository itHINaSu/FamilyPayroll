"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Field, Input, Select } from "@/components/ui";
import type { AccountType } from "@/db/schema";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { parseDollarsToCents, resolveSplit, type SplitMode, type SplitRow } from "@/lib/split";
import { ACCOUNT_LABELS, ALL_ACCOUNTS, MONEY_TYPES, type MoneyType } from "@/lib/transaction-kinds";
import { recordMoney, type MoneyFormState } from "./actions";

/** What the form needs to know about the child it records for. */
export type MoneyKid = {
  id: string;
  name: string;
  balances: Record<AccountType, number>;
  /** The payroll split, for "Use pay split". */
  paySplit: { checking: number; savings: number; generosity: number };
  roundingBucket: AccountType;
};

function accountOption(a: AccountType) {
  return (
    <option key={a} value={a}>
      {a === "held" ? "Held (parents only)" : ACCOUNT_LABELS[a]}
    </option>
  );
}

function Submit({ type }: { type: MoneyType }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full !py-2.5">
      {pending ? "Saving…" : type === "transfer" ? "Transfer" : `Record ${type}`}
    </Button>
  );
}

/**
 * One transaction for one child: Income, Expense or Transfer. Checking is the
 * default account; income and expenses can be split across accounts by
 * dollars or percent. Anything may overdraw — the form says so first.
 */
export function MoneyForm({ kid, onDone }: { kid: MoneyKid; onDone?: () => void }) {
  const [state, formAction] = useActionState<MoneyFormState, FormData>(recordMoney, {});
  const [type, setType] = useState<MoneyType>("expense");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState<AccountType>("checking");
  const [from, setFrom] = useState<AccountType>("checking");
  const [to, setTo] = useState<AccountType>("savings");
  const [splitting, setSplitting] = useState(false);
  const [mode, setMode] = useState<SplitMode>("amount");
  const [rows, setRows] = useState<SplitRow[]>([]);

  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state, onDone]);

  const totalCents = parseAmountToCents(amount) ?? 0;

  const startSplit = () => {
    setSplitting(true);
    setRows([
      { account, value: "" },
      { account: account === "savings" ? "checking" : "savings", value: "" },
    ]);
  };

  const usePaySplit = () => {
    setMode("percent");
    setRows(
      (["checking", "savings", "generosity"] as const)
        .filter((a) => kid.paySplit[a] > 0)
        .map((a) => ({ account: a, value: String(kid.paySplit[a]) })),
    );
  };

  const split =
    splitting && totalCents > 0 ? resolveSplit(totalCents, mode, rows, kid.roundingBucket) : null;
  const assignedCents =
    mode === "amount"
      ? rows.reduce((n, r) => n + (parseDollarsToCents(r.value) ?? 0), 0)
      : 0;
  const assignedBp =
    mode === "percent"
      ? rows.reduce((n, r) => n + Math.round((Number(r.value.replace("%", "")) || 0) * 100), 0)
      : 0;

  // Where each account would land, for the overdraw warning.
  const deltas = new Map<AccountType, number>();
  if (totalCents > 0) {
    if (type === "transfer") {
      if (from !== to) {
        deltas.set(from, -totalCents);
        deltas.set(to, totalCents);
      }
    } else if (type === "expense") {
      const parts =
        splitting && split && "parts" in split
          ? split.parts
          : splitting
            ? []
            : [{ accountType: account, amountCents: totalCents }];
      for (const p of parts) deltas.set(p.accountType, -(p.amountCents));
    }
  }
  const overdrawn = [...deltas.entries()]
    .map(([a, d]) => ({ a, after: kid.balances[a] + d }))
    .filter((x) => x.after < 0);

  const segment = (t: MoneyType) => (
    <button
      key={t}
      type="button"
      onClick={() => {
        setType(t);
        if (t === "transfer") setSplitting(false);
      }}
      aria-pressed={type === t}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
        type === t
          ? "bg-white shadow-sm dark:bg-ink-700"
          : "text-ink-500 hover:text-ink-800 dark:text-ink-300"
      }`}
    >
      {MONEY_TYPES[t].label}
    </button>
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="childId" value={kid.id} />
      <input type="hidden" name="type" value={type} />
      {splitting && <input type="hidden" name="split" value="1" />}
      {splitting && <input type="hidden" name="splitMode" value={mode} />}

      <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900">
        {(["income", "expense", "transfer"] as const).map(segment)}
      </div>

      {state.error && <Alert>{state.error}</Alert>}

      <Field label="Amount">
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      {type === "transfer" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Select name="fromAccount" value={from} onChange={(e) => setFrom(e.target.value as AccountType)}>
              {ALL_ACCOUNTS.map(accountOption)}
            </Select>
          </Field>
          <Field label="To">
            <Select name="toAccount" value={to} onChange={(e) => setTo(e.target.value as AccountType)}>
              {ALL_ACCOUNTS.map(accountOption)}
            </Select>
          </Field>
        </div>
      ) : !splitting ? (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium text-ink-700 dark:text-ink-200">Account</span>
            <button
              type="button"
              onClick={startSplit}
              className="text-sm font-medium text-ledger-600 hover:underline dark:text-ledger-500"
            >
              Split…
            </button>
          </div>
          <Select
            name="account"
            aria-label="Account"
            value={account}
            onChange={(e) => setAccount(e.target.value as AccountType)}
          >
            {ALL_ACCOUNTS.map(accountOption)}
          </Select>
        </div>
      ) : (
        <SplitEditor
          mode={mode}
          setMode={setMode}
          rows={rows}
          setRows={setRows}
          totalCents={totalCents}
          assignedCents={assignedCents}
          assignedBp={assignedBp}
          parts={split && "parts" in split ? split.parts : null}
          onUsePaySplit={usePaySplit}
          onCancel={() => setSplitting(false)}
        />
      )}

      <Field label="What for">
        <Input name="description" required placeholder={MONEY_TYPES[type].placeholder} />
      </Field>

      <Field label="Date" hint="Leave as today, or backdate something you forgot.">
        <Input name="occurredOn" type="date" />
      </Field>

      {overdrawn.length > 0 && (
        <Alert tone="warning">
          {overdrawn.map((o) => (
            <span key={o.a} className="block">
              This takes {ACCOUNT_LABELS[o.a]} to{" "}
              <span className="tnum font-medium">{formatCents(o.after)}</span>.
            </span>
          ))}
        </Alert>
      )}

      <Submit type={type} />
    </form>
  );
}

function SplitEditor({
  mode,
  setMode,
  rows,
  setRows,
  totalCents,
  assignedCents,
  assignedBp,
  parts,
  onUsePaySplit,
  onCancel,
}: {
  mode: SplitMode;
  setMode: (m: SplitMode) => void;
  rows: SplitRow[];
  setRows: (r: SplitRow[]) => void;
  totalCents: number;
  assignedCents: number;
  assignedBp: number;
  parts: { accountType: AccountType; amountCents: number }[] | null;
  onUsePaySplit: () => void;
  onCancel: () => void;
}) {
  const update = (i: number, patch: Partial<SplitRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const unused = ALL_ACCOUNTS.filter((a) => !rows.some((r) => r.account === a));
  const remaining = totalCents - assignedCents;

  return (
    <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-700 dark:text-ink-200">Split</span>
        <div className="flex gap-1 rounded-md bg-ink-100 p-0.5 dark:bg-ink-900">
          {(["amount", "percent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setRows(rows.map((r) => ({ ...r, value: "" })));
              }}
              className={`w-10 rounded px-2 py-1 text-sm font-medium ${
                mode === m ? "bg-white shadow-sm dark:bg-ink-700" : "text-ink-500 dark:text-ink-300"
              }`}
            >
              {m === "amount" ? "$" : "%"}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((r, i) => {
          const part = parts?.find((p) => p.accountType === r.account);
          return (
            <li key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  name="splitAccount"
                  aria-label="Account"
                  value={r.account}
                  onChange={(e) => update(i, { account: e.target.value as AccountType })}
                >
                  {ALL_ACCOUNTS.filter((a) => a === r.account || unused.includes(a)).map(accountOption)}
                </Select>
              </div>
              <div className="relative w-20 shrink-0">
                <Input
                  name="splitValue"
                  inputMode="decimal"
                  aria-label={mode === "amount" ? "Dollars" : "Percent"}
                  placeholder={mode === "amount" ? "0.00" : "0"}
                  value={r.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className={mode === "percent" ? "pr-7" : ""}
                />
                {mode === "percent" && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                    %
                  </span>
                )}
              </div>
              {mode === "amount" ? (
                <button
                  type="button"
                  onClick={() =>
                    update(i, {
                      value: (
                        Math.max(0, remaining + (parseDollarsToCents(r.value) ?? 0)) / 100
                      ).toFixed(2),
                    })
                  }
                  className="tap w-9 shrink-0 text-xs font-medium text-ledger-600 dark:text-ledger-500"
                >
                  Rest
                </button>
              ) : (
                <span className="tnum w-12 shrink-0 text-right text-xs text-ink-400">
                  {part ? formatCents(part.amountCents) : ""}
                </span>
              )}
              {rows.length > 2 && (
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  className="tap shrink-0 px-1 text-lg leading-none text-ink-400"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-right text-xs">
        {mode === "amount" ? (
          <span className={remaining === 0 ? "text-ink-400" : "text-amber-700 dark:text-amber-300"}>
            Remaining <span className="tnum">{formatCents(remaining)}</span>
          </span>
        ) : (
          <span className={assignedBp === 10_000 ? "text-ink-400" : "text-amber-700 dark:text-amber-300"}>
            Total {assignedBp / 100}% {assignedBp === 10_000 ? "" : "· must be 100%"}
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {unused.length > 0 && (
          <button
            type="button"
            onClick={() => setRows([...rows, { account: unused[0], value: "" }])}
            className="font-medium text-ledger-600 dark:text-ledger-500"
          >
            + Account
          </button>
        )}
        <button
          type="button"
          onClick={onUsePaySplit}
          className="font-medium text-ledger-600 dark:text-ledger-500"
        >
          Use pay split
        </button>
        <button type="button" onClick={onCancel} className="ml-auto text-ink-400">
          Don&apos;t split
        </button>
      </div>
    </div>
  );
}
