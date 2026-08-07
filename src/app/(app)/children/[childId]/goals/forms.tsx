"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { FileInput } from "@/components/file-input";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { formatCents } from "@/lib/money";
import type { GoalWithProgress } from "@/lib/goals";
import {
  addGoal,
  buyGoal,
  cancelGoal,
  moveGoalMoney,
  type GoalState,
} from "./actions";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

export function AddGoalForm({ childId }: { childId: string }) {
  const [state, formAction] = useActionState<GoalState, FormData>(addGoal, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-4 text-lg font-semibold">Add a goal</h2>

      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="childId" value={childId} />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Goal added.</Alert>}

        <Field label="What are they saving for">
          <Input name="name" required placeholder="Lego Millennium Falcon" />
        </Field>

        <Field label="How much it costs">
          <Input name="target" inputMode="decimal" placeholder="49.99" required />
        </Field>

        <Field
          label="Picture"
          hint="Any size — it is resized automatically. A picture matters more than the number at this age."
        >
          <FileInput name="photo" accept="image/*" label="Choose photo" />
        </Field>

        <Submit>Add goal</Submit>
      </form>
    </Card>
  );
}

export function GoalCard({
  goal,
  childId,
}: {
  goal: GoalWithProgress;
  childId: string;
}) {
  const [moveState, moveAction] = useActionState<GoalState, FormData>(
    moveGoalMoney,
    {},
  );
  const [buyState, buyAction] = useActionState<GoalState, FormData>(buyGoal, {});
  const [showBuy, setShowBuy] = useState(false);

  const complete = goal.savedCents >= goal.targetCents;

  return (
    <Card>
      <div className="flex gap-4">
        {goal.photoBlobId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/blobs/${goal.photoBlobId}`}
            alt=""
            className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-ink-100 text-3xl dark:bg-ink-700">
            🎯
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="truncate font-medium">{goal.name}</h3>
            <span className="tnum whitespace-nowrap text-sm">
              {formatCents(goal.savedCents)}{" "}
              <span className="text-ink-400">of {formatCents(goal.targetCents)}</span>
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-700">
            <div
              className={`h-full rounded-full transition-all ${
                complete ? "bg-ledger-600" : "bg-ledger-500"
              }`}
              style={{ width: `${goal.progressPct}%` }}
            />
          </div>

          <p className="mt-1.5 text-xs text-ink-400">
            {complete
              ? "Fully funded — ready to buy."
              : `${formatCents(goal.remainingCents)} to go · ${goal.progressPct}%`}
          </p>
        </div>
      </div>

      {(moveState.error || buyState.error) && (
        <div className="mt-3">
          <Alert>{moveState.error ?? buyState.error}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink-100 pt-4 dark:border-ink-700">
        <form action={moveAction} className="flex items-end gap-2">
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="goalId" value={goal.id} />
          <input type="hidden" name="direction" value="in" />
          <div className="w-24">
            <Input name="amount" inputMode="decimal" placeholder="0.00" />
          </div>
          <Button type="submit" variant="secondary" className="!py-2 text-xs">
            Set aside
          </Button>
        </form>

        <form action={moveAction} className="flex items-end gap-2">
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="goalId" value={goal.id} />
          <input type="hidden" name="direction" value="out" />
          <div className="w-24">
            <Input name="amount" inputMode="decimal" placeholder="0.00" />
          </div>
          <Button type="submit" variant="secondary" className="!py-2 text-xs">
            Take back
          </Button>
        </form>

        {complete && !showBuy && (
          <Button
            type="button"
            onClick={() => setShowBuy(true)}
            className="!py-2 text-xs"
          >
            Buy it
          </Button>
        )}

        <form action={cancelGoal} className="ml-auto">
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="goalId" value={goal.id} />
          <button
            type="submit"
            className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
            title="Money set aside returns to general savings"
          >
            Cancel goal
          </button>
        </form>
      </div>

      {showBuy && (
        <form action={buyAction} className="mt-3 flex items-end gap-2">
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="goalId" value={goal.id} />
          <div className="flex-1">
            <Input name="description" placeholder="What was bought" defaultValue={goal.name} />
          </div>
          <Button type="submit" className="!py-2 text-xs">
            Confirm purchase
          </Button>
          <button
            type="button"
            onClick={() => setShowBuy(false)}
            className="text-xs text-ink-400"
          >
            Cancel
          </button>
        </form>
      )}
    </Card>
  );
}
