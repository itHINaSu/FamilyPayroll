"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import {
  ACCOUNT_LABELS,
  TRANSACTION_KINDS,
  type TransactionKind,
} from "@/lib/transaction-kinds";
import {
  recordManualTransaction,
  recordManualTransfer,
  type LedgerFormState,
} from "./ledger-actions";

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Recording…" : children}
    </Button>
  );
}

export function MoneyForms({ childId }: { childId: string }) {
  const [tab, setTab] = useState<"transaction" | "transfer">("transaction");

  return (
    <Card className="h-fit">
      <div className="mb-4 flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900">
        {(["transaction", "transfer"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === t
                ? "bg-white shadow-sm dark:bg-ink-700"
                : "text-ink-500 hover:text-ink-800 dark:text-ink-300"
            }`}
          >
            {t === "transaction" ? "Record money" : "Transfer"}
          </button>
        ))}
      </div>

      {tab === "transaction" ? (
        <TransactionForm childId={childId} />
      ) : (
        <TransferForm childId={childId} />
      )}
    </Card>
  );
}

function TransactionForm({ childId }: { childId: string }) {
  const [state, formAction] = useActionState<LedgerFormState, FormData>(
    recordManualTransaction,
    {},
  );
  const [kind, setKind] = useState<TransactionKind>("purchase");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const spec = TRANSACTION_KINDS[kind];

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="childId" value={childId} />

      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">Recorded.</Alert>}

      <Field label="What happened" hint={spec.hint}>
        <Select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as TransactionKind)}
        >
          {Object.entries(TRANSACTION_KINDS).map(([value, k]) => (
            <option key={value} value={value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Account">
        {/* Keyed so React rebuilds the list when the eligible accounts change,
            rather than leaving a now-invalid selection in place. */}
        <Select name="account" key={kind} defaultValue={spec.accounts[0]}>
          {spec.accounts.map((a) => (
            <option key={a} value={a}>
              {ACCOUNT_LABELS[a]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Amount"
        hint={
          spec.direction === 0
            ? "Use a minus sign to reduce the balance."
            : spec.direction > 0
              ? "Added to the balance."
              : "Taken off the balance."
        }
      >
        <Input name="amount" inputMode="decimal" placeholder="0.00" required />
      </Field>

      <Field label="What for">
        <Input
          name="description"
          required
          placeholder={
            kind === "donation" ? "Food bank" : kind === "purchase" ? "Pokémon cards" : ""
          }
        />
      </Field>

      <Field label="Date" hint="Leave as today, or backdate something you forgot.">
        <Input name="occurredOn" type="date" />
      </Field>

      <SubmitButton>Record</SubmitButton>
    </form>
  );
}

function TransferForm({ childId }: { childId: string }) {
  const [state, formAction] = useActionState<LedgerFormState, FormData>(
    recordManualTransfer,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const accounts = ["checking", "savings", "generosity"] as const;

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="childId" value={childId} />

      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">Transferred.</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Select name="fromAccount" defaultValue="checking">
            {accounts.map((a) => (
              <option key={a} value={a}>
                {ACCOUNT_LABELS[a]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="To">
          <Select name="toAccount" defaultValue="savings">
            {accounts.map((a) => (
              <option key={a} value={a}>
                {ACCOUNT_LABELS[a]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Amount">
        <Input name="amount" inputMode="decimal" placeholder="0.00" required />
      </Field>

      <Field label="What for">
        <Input name="description" required placeholder="Saving for a Lego set" />
      </Field>

      <Field label="Date">
        <Input name="occurredOn" type="date" />
      </Field>

      <SubmitButton>Transfer</SubmitButton>
    </form>
  );
}
