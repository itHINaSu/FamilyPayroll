"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Card, CheckField, Field, Input, Select } from "@/components/ui";
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
      <CheckField
        name={field.path}
        defaultChecked={value === true}
        label={field.label}
        hint={field.hint}
      />
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
  sections,
}: {
  scopeType: "household" | "child";
  scopeId: string;
  effective: Policy;
  overriddenSections: string[];
  /** Only these section keys; others are left exactly as saved. */
  sections?: string[];
}) {
  const shown = sections
    ? SETTINGS_SECTIONS.filter((s) => sections.includes(s.key))
    : SETTINGS_SECTIONS;
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

  // Nine sections open at once is the wall a new household hits here. Only the
  // ones marked commonlyUsed start expanded; anything already overridden at
  // child scope opens too, since a parent editing a divergence should not have
  // to go find it first.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(
      SETTINGS_SECTIONS.map((s) => [
        s.key,
        // A focused page (a few sections) opens them all.
        !!sections || !!s.commonlyUsed || overriddenSections.includes(s.key),
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

      {shown.map((section) => {
        const isOn = enabled[section.key];
        const isExpanded = expanded[section.key];
        const fields = section.fields.filter((f) => showAdvanced || !f.advanced);

        return (
          <Card key={section.key}>
            <div className="flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={() =>
                  setExpanded({ ...expanded, [section.key]: !isExpanded })
                }
                className="-my-2 flex flex-1 items-start gap-2 py-2 text-left"
                aria-expanded={isExpanded}
              >
                <span
                  className={`mt-1 text-ink-400 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                  aria-hidden
                >
                  ▸
                </span>
                <span>
                  <h3 className="font-semibold">
                    {section.title}
                    {scopeType === "child" && isOn && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        overridden
                      </span>
                    )}
                  </h3>
                  {isExpanded && (
                    <p className="mt-1 text-xs text-ink-400">{section.description}</p>
                  )}
                </span>
              </button>

              {scopeType === "child" && (
                <label className="-my-2 flex flex-shrink-0 items-center gap-2 py-2 text-xs text-ink-400">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={(e) => {
                      setEnabled({ ...enabled, [section.key]: e.target.checked });
                      // Ticking an override with the section still collapsed
                      // would hide the very fields being turned on.
                      if (e.target.checked) setExpanded({ ...expanded, [section.key]: true });
                    }}
                  />
                  Override
                </label>
              )}
            </div>

            {isOn && <input type="hidden" name={`__section_${section.key}`} value="1" />}

            {/* Hidden via class rather than unmounted, so a collapsed section's
                values still post — collapsing is a display preference, not a
                way to discard what is set. */}
            <div className={isExpanded ? "mt-4" : "hidden"}>
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
            </div>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
