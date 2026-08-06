"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatCents } from "@/lib/money";
import type { KioskChild, KioskChildDetail } from "@/lib/kiosk";

/**
 * The kiosk display.
 *
 * Design constraints from SPEC §7.1, all deliberate:
 *
 *  - Children this age read unevenly, so this leans on colour, size, photos, and
 *    progress rings rather than the payroll aesthetic used for parents.
 *  - Never a shame board. Unmet responsibilities are shown as money *still
 *    available to earn*, which is the same data with the opposite valence —
 *    especially important with a sibling standing next to them.
 *  - Offline tolerance: the clock keeps a "last updated" stamp so a dropped
 *    network shows staleness rather than an error screen.
 */

const TONE_BG: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-rose-500",
};

function Ring({ pct, label }: { pct: number; label: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, pct / 100)));

  return (
    <div className="relative h-20 w-20 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={radius} className="fill-none stroke-white/15" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          className="fill-none stroke-emerald-400 transition-all duration-700"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
        {label}
      </span>
    </div>
  );
}

function Avatar({
  photoBlobId,
  name,
  size = "h-20 w-20",
}: {
  photoBlobId: string | null;
  name: string;
  size?: string;
}) {
  if (photoBlobId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/blobs/${photoBlobId}?kiosk=1`}
        alt=""
        className={`${size} flex-shrink-0 rounded-full object-cover ring-4 ring-white/10`}
      />
    );
  }
  return (
    <div
      className={`${size} flex flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-3xl font-bold`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function KioskShell({
  householdName,
  mode,
  roster,
  detail,
  token,
}: {
  householdName: string;
  mode: string;
  roster: KioskChild[];
  detail: KioskChildDetail | null;
  token: string | null;
}) {
  const [stamp, setStamp] = useState<string>("");

  useEffect(() => {
    // Persist the token so the wall tablet stays paired across restarts.
    if (token) {
      document.cookie = `fp_kiosk=${token}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [token]);

  useEffect(() => {
    const update = () =>
      setStamp(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    update();

    // A full reload keeps the display current without any client data layer, and
    // recovers on its own once a dropped network comes back.
    const refresh = setInterval(() => window.location.reload(), 120_000);
    const tick = setInterval(update, 30_000);

    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="min-h-screen bg-ink-900 p-6 text-white">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{householdName}</h1>
        <span className="text-xs text-white/40">as of {stamp}</span>
      </header>

      {detail ? (
        <ChildDetail detail={detail} />
      ) : mode === "task_progress" ? (
        <ProgressBoard roster={roster} />
      ) : mode === "balances" ? (
        <BalanceBoard roster={roster} />
      ) : (
        <Roster roster={roster} />
      )}
    </div>
  );
}

function Roster({ roster }: { roster: KioskChild[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {roster.map((c) => (
        <Link
          key={c.id}
          href={`/kiosk?child=${c.id}`}
          className="flex flex-col items-center rounded-3xl bg-white/5 p-8 transition hover:bg-white/10"
        >
          <Avatar photoBlobId={c.photoBlobId} name={c.name} size="h-28 w-28" />
          <p className="mt-4 text-2xl font-semibold">{c.name}</p>
          <p className="tnum mt-1 text-3xl text-emerald-400">{formatCents(c.total)}</p>
        </Link>
      ))}
    </div>
  );
}

function BalanceBoard({ roster }: { roster: KioskChild[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {roster.map((c) => (
        <div key={c.id} className="rounded-3xl bg-white/5 p-6">
          <div className="mb-5 flex items-center gap-4">
            <Avatar photoBlobId={c.photoBlobId} name={c.name} />
            <div>
              <p className="text-2xl font-semibold">{c.name}</p>
              <p className="tnum text-3xl text-emerald-400">{formatCents(c.total)}</p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-center">
            <Bucket label="Spend" cents={c.checking} emoji="💵" />
            <Bucket label="Save" cents={c.savings} emoji="🏦" />
            <Bucket label="Give" cents={c.generosity} emoji="💝" />
          </dl>

          {c.pendingCents > 0 && (
            <p className="mt-4 text-center text-sm text-white/60">
              <span className="tnum text-emerald-400">{formatCents(c.pendingCents)}</span>{" "}
              earned so far · payday {c.payDate}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Bucket({ label, cents, emoji }: { label: string; cents: number; emoji: string }) {
  return (
    <div className="rounded-2xl bg-white/5 py-4">
      <div className="text-2xl">{emoji}</div>
      <dt className="mt-1 text-xs uppercase tracking-wide text-white/40">{label}</dt>
      <dd className="tnum mt-0.5 text-lg font-semibold">{formatCents(cents)}</dd>
    </div>
  );
}

function ProgressBoard({ roster }: { roster: KioskChild[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {roster.map((c) => {
        const pct =
          c.potentialCents > 0
            ? Math.round((c.pendingCents / c.potentialCents) * 100)
            : 0;

        return (
          <div key={c.id} className="rounded-3xl bg-white/5 p-6">
            <div className="mb-5 flex items-center gap-4">
              <Avatar photoBlobId={c.photoBlobId} name={c.name} />
              <div className="flex-1">
                <p className="text-2xl font-semibold">{c.name}</p>
                <p className="tnum text-sm text-white/60">
                  {formatCents(c.pendingCents)} of {formatCents(c.potentialCents)} this
                  week
                </p>
              </div>
              <Ring pct={pct} label={`${pct}%`} />
            </div>

            <StillAvailable responsibilities={c.responsibilities} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Deliberately not a list of what was missed.
 *
 * The same rows, titled as money still on the table, is the difference between a
 * scoreboard and an invitation — and it matters most when a sibling is reading
 * it over their shoulder.
 */
function StillAvailable({
  responsibilities,
}: {
  responsibilities: KioskChild["responsibilities"];
}) {
  const remaining = responsibilities.filter((r) => r.remainingCents > 0);

  if (remaining.length === 0) {
    return (
      <p className="rounded-2xl bg-emerald-500/15 py-3 text-center text-sm text-emerald-300">
        Everything earned this week. Nothing left on the table.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-white/40">
        Still available to earn
      </p>
      <ul className="space-y-1.5">
        {remaining.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-sm">
            <span>{r.name}</span>
            <span className="tnum text-emerald-400">
              {formatCents(r.remainingCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChildDetail({ detail }: { detail: KioskChildDetail }) {
  const pct =
    detail.potentialCents > 0
      ? Math.round((detail.pendingCents / detail.potentialCents) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <Link href="/kiosk" className="inline-block text-sm text-white/50 hover:text-white">
        ← Everyone
      </Link>

      <div className="flex flex-wrap items-center gap-6 rounded-3xl bg-white/5 p-6">
        <Avatar photoBlobId={detail.photoBlobId} name={detail.name} size="h-28 w-28" />
        <div className="flex-1">
          <p className="text-3xl font-semibold">{detail.name}</p>
          <p className="tnum text-4xl text-emerald-400">{formatCents(detail.total)}</p>
          {detail.pendingCents > 0 && (
            <p className="mt-1 text-sm text-white/60">
              <span className="tnum">{formatCents(detail.pendingCents)}</span> earned
              this week · payday {detail.payDate}
            </p>
          )}
        </div>
        <Ring pct={pct} label={`${pct}%`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Bucket label="Spend" cents={detail.checking} emoji="💵" />
        <Bucket label="Save" cents={detail.savings} emoji="🏦" />
        <Bucket label="Give" cents={detail.generosity} emoji="💝" />
      </div>

      {detail.nextBill && (
        <div
          className={`rounded-3xl p-6 ${
            detail.nextBill.shortfallCents > 0 ? "bg-amber-500/15" : "bg-white/5"
          }`}
        >
          <p className="text-lg font-semibold">
            {detail.nextBill.name} is due {detail.nextBill.dueDate}
          </p>
          {detail.nextBill.shortfallCents > 0 ? (
            <p className="mt-1 text-amber-200">
              You have {formatCents(detail.checking)}. You need{" "}
              {formatCents(detail.checking + detail.nextBill.shortfallCents)}.
            </p>
          ) : (
            <p className="mt-1 text-white/60">You have enough set aside.</p>
          )}
        </div>
      )}

      <div className="rounded-3xl bg-white/5 p-6">
        <StillAvailable responsibilities={detail.responsibilities} />
      </div>

      {detail.goals.length > 0 && (
        <div className="rounded-3xl bg-white/5 p-6">
          <p className="mb-3 text-xs uppercase tracking-wide text-white/40">
            Saving for
          </p>
          <div className="space-y-4">
            {detail.goals.map((g) => (
              <div key={g.name} className="flex items-center gap-4">
                {g.photoBlobId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/blobs/${g.photoBlobId}?kiosk=1`}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-2xl">
                    🎯
                  </div>
                )}
                <div className="flex-1">
                  <p className="mb-1.5 text-sm">{g.name}</p>
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                      style={{ width: `${g.progressPct}%` }}
                    />
                  </div>
                </div>
                <span className="tnum text-sm text-white/60">{g.progressPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trust appears only here, inside one child's own view — never on the
          shared roster, where a red state beside a sibling's green one would be
          a scoreboard rather than a conversation (invariant I11). */}
      {detail.trust.length > 0 && (
        <div className="rounded-3xl bg-white/5 p-6">
          <p className="mb-3 text-xs uppercase tracking-wide text-white/40">
            What you are ready for
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {detail.trust.map((t) => (
              <div key={t.areaName} className="rounded-2xl bg-white/5 p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${TONE_BG[t.tone]}`} />
                  <span className="text-sm text-white/60">{t.areaName}</span>
                  {t.load !== null && (
                    <span className="tnum ml-auto text-xs text-white/40">{t.load}</span>
                  )}
                </div>
                <p className="mt-1 text-lg font-semibold">{t.levelName}</p>
                <p className="text-xs text-white/50">{t.recovery}</p>
              </div>
            ))}
          </div>

          {detail.focusNote && (
            <p className="mt-4 rounded-2xl bg-white/5 p-4 text-sm">
              <span className="text-white/40">Working on: </span>
              {detail.focusNote}
            </p>
          )}

          {detail.readyFor.length > 0 && (
            <p className="mt-4 text-sm text-emerald-300">
              Ready for: {detail.readyFor.join(" · ")}
            </p>
          )}
          {detail.notReadyFor.length > 0 && (
            <p className="mt-1 text-sm text-white/40">
              Not yet: {detail.notReadyFor.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
