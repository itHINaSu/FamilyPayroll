"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import {
  addArea,
  addPrivilege,
  addRule,
  archiveArea,
  archivePrivilege,
  archiveRule,
  editArea,
  editPrivilege,
  editRule,
  toggleAreaMembership,
  type RuleState,
} from "./actions";

function Submit({ children, small }: { children: string; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={small ? "" : "w-full"}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

/** A collapsed "+ Add X" link that expands into an inline form on click. */
function AddLink({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-ledger-600 hover:underline"
      >
        + {label}
      </button>
    );
  }

  return <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">{children(() => setOpen(false))}</div>;
}

export function InlineAddRule({ areaId }: { areaId: string }) {
  const [state, formAction] = useActionState<RuleState, FormData>(addRule, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <AddLink label="Add a rule">
      {(close) => (
        <form ref={formRef} action={formAction} className="space-y-3">
          <input type="hidden" name="trustAreaId" value={areaId} />
          {state.error && <Alert tone={state.ok ? "warning" : "error"}>{state.error}</Alert>}
          <Field label="Rule">
            <Input name="text" required placeholder="Follow directions the first time" />
          </Field>
          <Field
            label="Points when missed"
            hint="Not shown to a child in advance by default."
          >
            <Input name="defaultWeight" type="number" min={1} max={10} defaultValue={1} />
          </Field>
          <div className="flex gap-2">
            <Submit small>Add</Submit>
            <button type="button" onClick={close} className="text-sm text-ink-400 hover:text-ink-700">
              Cancel
            </button>
          </div>
        </form>
      )}
    </AddLink>
  );
}

export function InlineAddPrivilege({ areaId }: { areaId: string }) {
  const [state, formAction] = useActionState<RuleState, FormData>(addPrivilege, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <AddLink label="Add a privilege">
      {(close) => (
        <form ref={formRef} action={formAction} className="space-y-3">
          <input type="hidden" name="trustAreaId" value={areaId} />
          {state.error && <Alert>{state.error}</Alert>}
          <Field label="Privilege">
            <Input name="name" required placeholder="Tablet time" />
          </Field>
          <Field label="Needs at least">
            <Select name="minLevel" defaultValue="3">
              <option value="3">Trusted</option>
              <option value="2">Working on it</option>
              <option value="1">Not ready today</option>
              <option value="0">Always available</option>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Submit small>Add</Submit>
            <button type="button" onClick={close} className="text-sm text-ink-400 hover:text-ink-700">
              Cancel
            </button>
          </div>
        </form>
      )}
    </AddLink>
  );
}

export function AddAreaLink() {
  const [state, formAction] = useActionState<RuleState, FormData>(addArea, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <AddLink label="Add an area">
      {(close) => (
        <form ref={formRef} action={formAction} className="space-y-3">
          {state.error && <Alert>{state.error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
            <Field label="Name">
              <Input name="name" required placeholder="Homework" />
            </Field>
            <Field label="Icon">
              <Input name="icon" placeholder="📚" maxLength={4} />
            </Field>
          </div>
          <p className="text-xs text-ink-400">Applies to every child right away.</p>
          <div className="flex gap-2">
            <Submit small>Add area</Submit>
            <button type="button" onClick={close} className="text-sm text-ink-400 hover:text-ink-700">
              Cancel
            </button>
          </div>
        </form>
      )}
    </AddLink>
  );
}

export function EditableRule({
  rule,
  onArchive,
}: {
  rule: { id: string; text: string; defaultWeight: number };
  onArchive: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<RuleState, FormData>(editRule, {});

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  if (editing) {
    return (
      <li className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="ruleId" value={rule.id} />
          {state.error && <Alert tone={state.ok ? "warning" : "error"}>{state.error}</Alert>}
          <Input name="text" defaultValue={rule.text} required autoFocus />
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">Points:</span>
            <Input
              name="defaultWeight"
              type="number"
              min={1}
              max={10}
              defaultValue={rule.defaultWeight}
              className="w-20"
            />
            <Submit small>Save</Submit>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-ink-400 hover:text-ink-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        {rule.text}
        <span className="tnum block text-xs text-ink-400">
          {rule.defaultWeight} pt{rule.defaultWeight === 1 ? "" : "s"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-ink-400 hover:text-ink-700"
        >
          Edit
        </button>
        {onArchive}
      </span>
    </li>
  );
}

export function EditablePrivilege({
  privilege: priv,
  onArchive,
}: {
  privilege: { id: string; name: string; minLevel: number };
  onArchive: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<RuleState, FormData>(editPrivilege, {});

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  const LEVEL_NAMES: Record<number, string> = {
    3: "Trusted",
    2: "Working on it",
    1: "Not ready today",
    0: "Always available",
  };

  if (editing) {
    return (
      <li className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="privilegeId" value={priv.id} />
          {state.error && <Alert>{state.error}</Alert>}
          <Input name="name" defaultValue={priv.name} required autoFocus />
          <div className="flex items-center gap-2">
            <Select name="minLevel" defaultValue={String(priv.minLevel)} className="w-auto">
              <option value="3">Trusted</option>
              <option value="2">Working on it</option>
              <option value="1">Not ready today</option>
              <option value="0">Always available</option>
            </Select>
            <Submit small>Save</Submit>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-ink-400 hover:text-ink-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        {priv.name}
        <span className="block text-xs text-ink-400">needs {LEVEL_NAMES[priv.minLevel]}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-ink-400 hover:text-ink-700"
        >
          Edit
        </button>
        {onArchive}
      </span>
    </li>
  );
}

export function EditAreaPanel({
  area,
  childList,
  members,
  onClose,
}: {
  area: { id: string; name: string; icon: string | null };
  childList: { id: string; displayName: string }[];
  members: Set<string>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<RuleState, FormData>(editArea, {});

  return (
    <div className="mb-4 space-y-4 rounded-lg border border-ink-200 p-3 dark:border-ink-700">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="areaId" value={area.id} />
        {state.error && <Alert>{state.error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
          <Field label="Name">
            <Input name="name" defaultValue={area.name} required />
          </Field>
          <Field label="Icon">
            <Input name="icon" defaultValue={area.icon ?? ""} maxLength={4} />
          </Field>
        </div>
        <Submit small>Save</Submit>
      </form>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
          Applies to
        </p>
        <ul className="space-y-1.5">
          {childList.map((c) => {
            const isMember = members.has(c.id);
            return (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span>{c.displayName}</span>
                <form action={toggleAreaMembership}>
                  <input type="hidden" name="areaId" value={area.id} />
                  <input type="hidden" name="childId" value={c.id} />
                  <input type="hidden" name="member" value={String(isMember)} />
                  <button
                    type="submit"
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      isMember
                        ? "bg-ledger-100 text-ledger-600"
                        : "bg-ink-100 text-ink-400 dark:bg-ink-700"
                    }`}
                  >
                    {isMember ? "Included" : "Excluded"}
                  </button>
                </form>
              </li>
            );
          })}
          {childList.length === 0 && (
            <li className="text-xs text-ink-400">No children yet.</li>
          )}
        </ul>
      </div>

      <button type="button" onClick={onClose} className="text-xs text-ink-400 hover:text-ink-700">
        Done
      </button>
    </div>
  );
}

export function AreaCard({
  area,
  rules,
  privileges,
  childList,
  members,
}: {
  area: { id: string; name: string; icon: string | null };
  rules: { id: string; text: string; defaultWeight: number }[];
  privileges: { id: string; name: string; minLevel: number }[];
  childList: { id: string; displayName: string }[];
  members: Set<string>;
}) {
  const [editingArea, setEditingArea] = useState(false);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">
          {area.icon && <span className="mr-2">{area.icon}</span>}
          {area.name}
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditingArea((v) => !v)}
            className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
          >
            {editingArea ? "Close" : "Edit area"}
          </button>
          <form action={archiveArea}>
            <input type="hidden" name="areaId" value={area.id} />
            <button
              type="submit"
              className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
            >
              Remove area
            </button>
          </form>
        </div>
      </div>

      {editingArea && (
        <EditAreaPanel
          area={area}
          childList={childList}
          members={members}
          onClose={() => setEditingArea(false)}
        />
      )}

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Rules</p>
      <ul className="mb-2 space-y-3 text-sm">
        {rules.map((r) => (
          <EditableRule
            key={r.id}
            rule={r}
            onArchive={
              <form action={archiveRule} className="inline">
                <input type="hidden" name="ruleId" value={r.id} />
                <button
                  type="submit"
                  aria-label="Remove"
                  className="tap px-1 text-sm text-ink-400 hover:text-ink-700"
                >
                  ✕
                </button>
              </form>
            }
          />
        ))}
        {rules.length === 0 && <li className="text-ink-400">No rules in this area yet.</li>}
      </ul>
      <div className="mb-5">
        <InlineAddRule areaId={area.id} />
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
        Privileges
      </p>
      <ul className="mb-2 space-y-3 text-sm">
        {privileges.map((p) => (
          <EditablePrivilege
            key={p.id}
            privilege={p}
            onArchive={
              <form action={archivePrivilege} className="inline">
                <input type="hidden" name="privilegeId" value={p.id} />
                <button
                  type="submit"
                  aria-label="Remove"
                  className="tap px-1 text-sm text-ink-400 hover:text-ink-700"
                >
                  ✕
                </button>
              </form>
            }
          />
        ))}
        {privileges.length === 0 && (
          <li className="text-ink-400">Nothing tied to this area yet.</li>
        )}
      </ul>
      <InlineAddPrivilege areaId={area.id} />
    </Card>
  );
}
