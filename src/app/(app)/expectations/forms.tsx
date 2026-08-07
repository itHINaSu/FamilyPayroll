"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { addArea, addPrivilege, addRule, type RuleState } from "./actions";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : children}
    </Button>
  );
}

type Areas = { id: string; name: string }[];

export function AddRuleForm({ areas }: { areas: Areas }) {
  const [state, formAction] = useActionState<RuleState, FormData>(addRule, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Add a rule</h2>
      <p className="mb-4 text-xs text-ink-400">
        Write something a child can see themselves doing or not doing. &ldquo;Follow
        directions the first time&rdquo; works; &ldquo;have a good attitude&rdquo;
        cannot be measured by the person being measured.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        {/* A vagueness note arrives alongside ok, so it is advice rather than
            a rejection — the rule was still saved as written. */}
        {state.error && <Alert tone={state.ok ? "warning" : "error"}>{state.error}</Alert>}
        {state.ok && !state.error && <Alert tone="info">Added.</Alert>}

        <Field label="Rule">
          <Input name="text" required placeholder="Follow directions the first time" />
        </Field>

        <Field label="Area">
          <Select name="trustAreaId" defaultValue={areas[0]?.id ?? ""}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Points when missed"
          hint="Not shown to a child in advance by default — a published price list invites arithmetic."
        >
          <Input name="defaultWeight" type="number" min={1} max={10} defaultValue={1} />
        </Field>

        <Submit>Add rule</Submit>
      </form>
    </Card>
  );
}

export function AddPrivilegeForm({ areas }: { areas: Areas }) {
  const [state, formAction] = useActionState<RuleState, FormData>(addPrivilege, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Add a privilege</h2>
      <p className="mb-4 text-xs text-ink-400">
        The app says what a child is ready for. It never switches anything off —
        that stays your conversation.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && !state.error && <Alert tone="info">Added.</Alert>}

        <Field label="Privilege">
          <Input name="name" required placeholder="Tablet time" />
        </Field>

        <Field label="Area">
          <Select name="trustAreaId" defaultValue={areas[0]?.id ?? ""}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Needs at least">
          <Select name="minLevel" defaultValue="3">
            <option value="3">Trusted</option>
            <option value="2">Working on it</option>
            <option value="1">Not ready today</option>
            <option value="0">Always available</option>
          </Select>
        </Field>

        <Submit>Add privilege</Submit>
      </form>
    </Card>
  );
}

export function AddAreaForm() {
  const [state, formAction] = useActionState<RuleState, FormData>(addArea, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <h2 className="mb-1 text-lg font-semibold">Add an area</h2>
      <p className="mb-4 text-xs text-ink-400">
        Areas keep trust separate. Being unkind to one friend should not cost
        television.
      </p>

      <form ref={formRef} action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">Added.</Alert>}

        <Field label="Name">
          <Input name="name" required placeholder="Homework" />
        </Field>

        <Field label="Icon">
          <Input name="icon" placeholder="📚" maxLength={4} />
        </Field>

        <Submit>Add area</Submit>
      </form>
    </Card>
  );
}
