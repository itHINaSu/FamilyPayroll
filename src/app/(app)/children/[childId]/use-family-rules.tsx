"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui";
import { clearChildOverrides } from "@/app/(app)/settings/actions";
import { formatDateRange, formatShortDate } from "@/lib/dates";
import type { PeriodChoice } from "@/lib/policy-schedule";

function Choice({ value, title, detail }: { value: "current" | "next"; title: string; detail: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="applyFrom"
      value={value}
      disabled={pending}
      className="block w-full rounded-lg border border-ink-200 px-4 py-3 text-left transition hover:border-ledger-500 active:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:active:bg-ink-900"
    >
      <span className="block font-medium">{title}</span>
      <span className="mt-0.5 block text-sm text-ink-400">{detail}</span>
    </button>
  );
}

/** Drop this child's own pay rules — this pay period, or from the next one. */
export function UseFamilyRules({ childId, period }: { childId: string; period: PeriodChoice }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" className="whitespace-nowrap" onClick={() => setOpen(true)}>
        Use family rules
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="When should this start?">
        <form
          action={async (formData) => {
            await clearChildOverrides(formData);
            setOpen(false);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="childId" value={childId} />
          <Choice
            value="current"
            title="This pay period"
            detail={`Counts for ${formatDateRange(period.startDate, period.endDate)}, paid ${formatShortDate(period.payDate)}.`}
          />
          <Choice
            value="next"
            title="Next pay period"
            detail={`Starts ${formatShortDate(period.nextStart)}. This period finishes under their current rules.`}
          />
        </form>
      </Sheet>
    </>
  );
}
