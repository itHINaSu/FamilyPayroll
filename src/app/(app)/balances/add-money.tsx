"use client";

import { useCallback, useState } from "react";

import { Sheet } from "@/components/sheet";
import { BandButton, Button } from "@/components/ui";
import { MoneyForm, type MoneyKid } from "./money-form";

/**
 * "+" in the title band. With several children it asks who the money is for
 * first — every transaction belongs to exactly one child.
 */
export function AddMoneyButton({ kids }: { kids: MoneyKid[] }) {
  const [open, setOpen] = useState(false);
  const [kidId, setKidId] = useState<string | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    setKidId(null);
  }, []);

  if (kids.length === 0) return null;
  const kid = kids.length === 1 ? kids[0] : kids.find((k) => k.id === kidId);

  return (
    <>
      <BandButton label="Add transaction" onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={close} title={kid ? `Money for ${kid.name}` : "Who is this for?"}>
        {kid ? (
          <MoneyForm kid={kid} onDone={close} />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {kids.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setKidId(k.id)}
                  className="w-full rounded-lg border border-ink-200 px-3 py-4 text-center font-medium transition hover:border-ledger-500 active:bg-ink-50 dark:border-ink-700 dark:active:bg-ink-900"
                >
                  {k.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

/** The full-width "Add transaction" on a child's card. */
export function AddMoneyInline({ kid }: { kid: MoneyKid }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="!py-2.5">
        Add transaction
      </Button>
      <Sheet open={open} onClose={close} title={`Money for ${kid.name}`}>
        <MoneyForm kid={kid} onDone={close} />
      </Sheet>
    </>
  );
}
