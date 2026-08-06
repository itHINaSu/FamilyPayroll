"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { saveSettings, type SettingsState } from "@/app/(app)/settings/actions";
import { SETTINGS_SECTIONS, getAtPath, type FieldSpec } from "@/lib/settings-schema";
import type { Policy } from "@/lib/policy";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

function FieldInput({ field, value }: { field: FieldSpec; value: unknown }) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name={field.path}
          defaultChecked={value === true}
          className="mt-1"
        />
        <span>
          {field.label}
          {field.hint && (
            <span className="block text-xs text-ink-400">{field.hint}</span>
          )}
        </span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={field.label} hint={field.hint}>
        <Select name={field.path} defaultValue={String(value ?? "")}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  return (
    <Field label={field.label} hint={field.hint}>
      <Input
        name={field.path}
        type="number"
        min={field.type === "percent" ? 0 : field.min}
        max={field.type === "percent" ? 100 : field.max}
        defaultValue={String(value ?? "")}
      />
    </Field>
  );
}

/**
 * The settings editor, generated from the catalogue so household and per-child
 * scopes cannot drift apart.
 *
 * At child scope each section is opt-in: an unticked section inherits from the
 * household and keeps inheriting when the household changes. That distinction is
 * what makes overrides genuinely partial rather than a frozen copy.
 */
export function SettingsEditor({
  scopeType,
  scopeId,
  effective,
  overriddenSections,
}: {
  scopeType: "household" | "child";
  scopeId: string;
  effective: Policy;
  overriddenSections: string[];
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    saveSettings,
    {},
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(
      SETTINGS_SECTIONS.map((s) => [
        s.key,
        scopeType === "household" || overriddenSections.includes(s.key),
      ]),
    ),
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="scopeType" value={scopeType} />
      <input type="hidden" name="scopeId" value={scopeId} />

      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm text-ink-400">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={(e) => setShowAdvanced(e.target.checked)}
          />
          Show advanced settings
        </label>
        <SaveButton />
      </div>

      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">Saved as a new version. History is unchanged.</Alert>}

      {SETTINGS_SECTIONS.map((section) => {
        const isOn = enabled[section.key];
        const fields = section.fields.filter((f) => showAdvanced || !f.advanced);

        return (
          <Card key={section.key}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">
                  {section.title}
                  {scopeType === "child" && isOn && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      overridden
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-xs text-ink-400">{section.description}</p>
              </div>

              {scopeType === "child" && (
                <label className="flex flex-shrink-0 items-center gap-2 text-xs text-ink-400">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={(e) =>
                      setEnabled({ ...enabled, [section.key]: e.target.checked })
                    }
                  />
                  Override
                </label>
              )}
            </div>

            {isOn && <input type="hidden" name={`__section_${section.key}`} value="1" />}

            <div
              className={`grid gap-4 sm:grid-cols-2 ${
                isOn ? "" : "pointer-events-none opacity-40"
              }`}
            >
              {fields.map((field) => (
                <FieldInput
                  key={field.path}
                  field={field}
                  value={getAtPath(effective, field.path)}
                />
              ))}
            </div>

            {scopeType === "child" && !isOn && (
              <p className="mt-3 text-xs text-ink-400">
                Following the household setting. Tick Override to diverge.
              </p>
            )}
          </Card>
        );
      })}

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
