"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Sheet } from "@/components/sheet";
import { Alert, Button, Card, CheckField, Field, Input, Select } from "@/components/ui";
import {
  previewSettings,
  saveSettings,
  type SettingsState,
} from "@/app/(app)/settings/actions";
import { formatDateRange, formatShortDate } from "@/lib/dates";
import { SETTINGS_SECTIONS, getAtPath, type FieldSpec } from "@/lib/settings-schema";
import type { Policy } from "@/lib/policy";
import {
  PAYDAY_DELAY_WEEKS,
  PAYDAY_MAX_DAYS,
  WEEKDAYS,
  describePayday,
  isWeekBased,
  weeklyOffset,
  weeklyPayday,
} from "@/lib/payday";
import type { PayPreview, PeriodChoice, PreviewPeriod } from "@/lib/policy-schedule";

/** Must match PAY_PERIOD_SECTIONS in lib/policy.ts (a server module). */
const PAY_PERIOD_SECTIONS = ["pay", "completion", "allocation", "interest", "bills"];

function FieldInput({
  field,
  value,
  effective,
}: {
  field: FieldSpec;
  value: unknown;
  effective: Policy;
}) {
  return (
    <>
      {/* Tells the server this field was on the page, so an unticked
          checkbox reads as "off" rather than "not shown". */}
      <input type="hidden" name="__fields" value={field.path} />
      {field.type === "payday" ? (
        <PaydayControl field={field} value={value} effective={effective} />
      ) : (
        <FieldControl field={field} value={value} />
      )}
    </>
  );
}

/**
 * Payday, picked the way people say it — "Saturday", "Friday, a week later"
 * — and posted as the days-after-period-end the policy stores. It follows
 * the schedule fields above it as they change: a new start day keeps the
 * payday weekday and works out the new gap.
 */
function PaydayControl({
  field,
  value,
  effective,
}: {
  field: FieldSpec;
  value: unknown;
  effective: Policy;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(Math.max(1, Number(value) || 1));
  const initial = { cadence: effective.pay.cadence as string, start: effective.pay.periodStartDay };
  const [schedule, setSchedule] = useState(initial);
  const scheduleRef = useRef(initial);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const name = (e.target as HTMLSelectElement).name;
      if (name !== "pay.cadence" && name !== "pay.periodStartDay") return;
      const read = (n: string) => (form.elements.namedItem(n) as HTMLSelectElement | null)?.value;
      const prev = scheduleRef.current;
      const next = {
        cadence: read("pay.cadence") ?? prev.cadence,
        start: Number(read("pay.periodStartDay") ?? prev.start),
      };
      if (next.start !== prev.start && isWeekBased(prev.cadence) && isWeekBased(next.cadence)) {
        setOffset((o) => {
          const p = weeklyPayday(o, prev.start);
          return weeklyOffset(p.weekday, p.delayWeeks, next.start);
        });
      }
      scheduleRef.current = next;
      setSchedule(next);
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);

  const hint = describePayday(offset, schedule.cadence, schedule.start);

  if (!isWeekBased(schedule.cadence)) {
    const days = Array.from({ length: Math.max(PAYDAY_MAX_DAYS, offset) }, (_, i) => i + 1);
    return (
      <div ref={ref}>
        <input type="hidden" name={field.path} value={offset} />
        <Field label={field.label} hint={hint}>
          {/* Named under pay. so changing it counts as a pay change; the
              server reads only the hidden field above. */}
          <Select
            name="pay.__paydayDays"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "The next morning" : `${d} days after`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    );
  }

  const { weekday, delayWeeks } = weeklyPayday(offset, schedule.start);
  // In order from the morning after the period ends.
  const weekdays = Array.from({ length: 7 }, (_, i) => (schedule.start + i) % 7);
  const delays = PAYDAY_DELAY_WEEKS.includes(delayWeeks)
    ? PAYDAY_DELAY_WEEKS
    : [...PAYDAY_DELAY_WEEKS, delayWeeks];

  return (
    <div ref={ref}>
      <input type="hidden" name={field.path} value={offset} />
      <Field label={field.label} hint={hint}>
        <span className="grid grid-cols-2 gap-2">
          <Select
            name="pay.__paydayWeekday"
            aria-label="Payday weekday"
            value={weekday}
            onChange={(e) => setOffset(weeklyOffset(Number(e.target.value), delayWeeks, schedule.start))}
          >
            {weekdays.map((d) => (
              <option key={d} value={d}>
                {WEEKDAYS[d]}
              </option>
            ))}
          </Select>
          <Select
            name="pay.__paydayDelay"
            aria-label="Weeks after the period"
            value={delayWeeks}
            onChange={(e) => setOffset(weeklyOffset(weekday, Number(e.target.value), schedule.start))}
          >
            {delays.map((w) => (
              <option key={w} value={w}>
                {w === 0 ? "Right after" : w === 1 ? "1 week later" : `${w} weeks later`}
              </option>
            ))}
          </Select>
        </span>
      </Field>
    </div>
  );
}

function FieldControl({ field, value }: { field: FieldSpec; value: unknown }) {
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
  period,
  scheduled = [],
}: {
  scopeType: "household" | "child";
  scopeId: string;
  effective: Policy;
  overriddenSections: string[];
  /** Only these section keys; others are left exactly as saved. */
  sections?: string[];
  /** When given, a pay change asks whether it starts this period or next. */
  period?: PeriodChoice;
  /** Changes already saved to start on a later date. */
  scheduled?: { from: string; lines: string[] }[];
}) {
  const shown = sections
    ? SETTINGS_SECTIONS.filter((s) => sections.includes(s.key))
    : SETTINGS_SECTIONS;
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveSettings,
    {},
  );
  const formId = useId();
  // Whether anything that affects pay has been touched since the last save.
  const [payTouched, setPayTouched] = useState(false);
  const [asking, setAsking] = useState(false);
  // What each answer would do, worked out on the server when the sheet opens.
  const [preview, setPreview] = useState<PayPreview | null | "loading">("loading");
  const formRef = useRef<HTMLFormElement>(null);
  const previewRun = useRef(0);

  const ask = () => {
    setAsking(true);
    setPreview("loading");
    const run = ++previewRun.current;
    previewSettings(new FormData(formRef.current!))
      .then((p) => run === previewRun.current && setPreview(p))
      .catch(() => run === previewRun.current && setPreview(null));
  };

  useEffect(() => {
    setAsking(false);
    if (state.ok) setPayTouched(false);
  }, [state]);

  const touch = (section: string) => {
    if (PAY_PERIOD_SECTIONS.includes(section)) setPayTouched(true);
  };
  const mustAsk = !!period && payTouched;

  const saveButton = (
    <Button
      type={mustAsk ? "button" : "submit"}
      onClick={mustAsk ? ask : undefined}
      disabled={pending}
    >
      {pending ? "Saving…" : "Save settings"}
    </Button>
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
    <form
      id={formId}
      ref={formRef}
      action={formAction}
      onChange={(e) => {
        const name = (e.target as unknown as { name?: string }).name ?? "";
        touch(name.split(".")[0]);
      }}
      className="space-y-6"
    >
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
        {saveButton}
      </div>

      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="info">{state.message}</Alert>}

      {scheduled.map((s) => (
        <Alert key={s.from} tone="info">
          <span className="block font-medium">Starting {formatShortDate(s.from)}</span>
          {s.lines.map((line) => (
            <span key={line} className="block text-xs">
              {line}
            </span>
          ))}
        </Alert>
      ))}

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
                      touch(section.key);
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
                    effective={effective}
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

      <div className="flex justify-end">{saveButton}</div>

      {period && (
        <Sheet open={asking} onClose={() => setAsking(false)} title="When should this start?">
          <div className="space-y-3">
            <WhenButton
              form={formId}
              value="current"
              pending={pending}
              title="This pay period"
              detail={`Counts from ${formatShortDate(period.startDate)}.`}
              periods={preview === "loading" ? "loading" : preview?.current}
              preview={preview}
            />
            <WhenButton
              form={formId}
              value="next"
              pending={pending}
              title="Next pay period"
              detail={`Starts ${formatShortDate(period.nextStart)}. This period finishes under the current rules.`}
              periods={preview === "loading" ? "loading" : preview?.next}
              preview={preview}
            />
          </div>
        </Sheet>
      )}
    </form>
  );
}

/** "Oct 10 – 16 · paid now · 6 days" — one period an answer would lead to. */
function periodLine(p: PreviewPeriod, preview: PayPreview): string {
  const paid =
    p.payDate > preview.today
      ? `paid ${formatShortDate(p.payDate)}`
      : preview.paused
        ? "due when payroll resumes"
        : "paid when you save";
  const odd = p.days === p.usualDays ? "" : ` · ${p.days} days`;
  return `${formatDateRange(p.startDate, p.endDate)} · ${paid}${odd}`;
}

/**
 * One answer in the "when should this start?" sheet — it submits the form.
 * Underneath, the pay periods that answer leads to.
 */
function WhenButton({
  form,
  value,
  pending,
  title,
  detail,
  periods,
  preview,
}: {
  form: string;
  value: "current" | "next";
  pending: boolean;
  title: string;
  detail: string;
  periods?: PreviewPeriod[] | "loading";
  preview: PayPreview | null | "loading";
}) {
  return (
    <button
      type="submit"
      form={form}
      name="applyFrom"
      value={value}
      disabled={pending}
      className="block w-full rounded-lg border border-ink-200 px-4 py-3 text-left transition hover:border-ledger-500 active:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:active:bg-ink-900"
    >
      <span className="block font-medium">{title}</span>
      <span className="mt-0.5 block text-sm text-ink-400">{detail}</span>
      {periods === "loading" ? (
        <span className="mt-1.5 block text-sm text-ink-400">Working out the dates…</span>
      ) : (
        periods &&
        preview &&
        preview !== "loading" && (
          <span className="mt-1.5 block space-y-0.5">
            {periods.map((p) => (
              <span key={p.startDate} className="block text-sm">
                {periodLine(p, preview)}
              </span>
            ))}
          </span>
        )
      )}
    </button>
  );
}
