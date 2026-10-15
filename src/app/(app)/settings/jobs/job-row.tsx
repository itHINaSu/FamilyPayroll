"use client";

import { useState } from "react";

import { formatCents } from "@/lib/money";
import { archiveJob } from "./actions";
import { EditJobRow } from "./form";

export function JobRow({
  job,
  eligibleLabel,
  repeatLabel,
  children,
}: {
  job: {
    id: string;
    name: string;
    description: string | null;
    valueCents: number;
    repeatRule: string;
    repeatN: number | null;
    limitScope: string;
    limitCount: number;
    claimExpiryHours: number;
    allocationMode: string;
    eligibleChildIds: string[] | null;
  };
  eligibleLabel: string;
  repeatLabel: string;
  children: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="border-b border-ink-100 pb-3 last:border-0 last:pb-0 dark:border-ink-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">
            {job.name}{" "}
            <span className="tnum ml-1 text-sm text-ledger-600 dark:text-ledger-500">
              {formatCents(job.valueCents)}
            </span>
          </p>
          {job.description && <p className="text-xs text-ink-400">{job.description}</p>}
          <p className="mt-0.5 text-xs text-ink-400">
            {repeatLabel} · {eligibleLabel}
          </p>
        </div>

        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <form action={archiveJob}>
            <input type="hidden" name="jobId" value={job.id} />
            <button
              type="submit"
              className="text-xs text-ink-400 hover:text-ink-700 hover:underline"
            >
              Archive
            </button>
          </form>
        </span>
      </div>

      {editing && (
        <EditJobRow
          job={{
            id: job.id,
            name: job.name,
            description: job.description,
            value: job.valueCents,
            repeatRule: job.repeatRule,
            repeatN: job.repeatN,
            limitScope: job.limitScope,
            limitCount: job.limitCount,
            claimExpiryHours: job.claimExpiryHours,
            allocationMode: job.allocationMode,
            eligibleChildIds: job.eligibleChildIds,
          }}
          children={children}
          onDone={() => setEditing(false)}
        />
      )}
    </li>
  );
}
