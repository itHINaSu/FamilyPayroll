# Family Payroll — Technical Specification

**Status:** Implemented, apart from child logins (phase 10) and graduation. See the repository README for what is and is not built.
**Branch:** `claude/family-chore-app-planning-97p0kf`

This document is the agreed design coming out of the planning conversation. It is
meant to be marked up. Anything labeled **[ASSUMPTION]** is a default chosen in the
absence of an explicit decision and can be struck without argument.

---

## 1. Product summary

Family Payroll is a self-hosted web application that teaches children personal
finance by modeling a real payroll and banking system. Children earn money by
meeting responsibilities, get paid on a schedule, pay recurring bills, save toward
goals, earn interest, and give money away — all recorded in a permanent ledger.

**Two independent tracks.** Money is one of them, and it is the larger part of
this document. The second is Trust, which governs privileges and freedom rather
than money (section 12). They never touch: character is not for sale, and a bad
Tuesday never reduces a paycheck.

| Tier | Name | Track | Paid? | Tracked? |
|---|---|---|---|---|
| 1 | **House Rules** | Trust | Never | Not scored — displayed as standing expectations |
| 2 | **Responsibilities** | Money | Weekly payroll | Per occurrence |
| 3 | **Bonus Jobs** | Money | Per job | Claimed and approved |

What both tracks unlock is the same thing — bigger opportunities: raises, harder
jobs, more independence. That is an outcome, not a third currency to score.

**Core philosophy**

- Children **earn**; they never **lose**. Unmet responsibilities mean money not earned,
  never money taken away.
- The application is the **ledger of record**. It is virtual. Real cash lives
  outside it and crosses the boundary through explicit deposit and withdrawal
  transactions. The parents are the bank.
- Parents retain complete control. Nearly every behavior is a setting.
- **Follow-through is the hard problem.** The system must be close to automatic. If
  a parent does nothing, the correct thing still happens.

**Vocabulary** — use payroll terminology throughout the UI. Never the word
"allowance."

Potential Pay · Earned Pay · Bonus Pay · Gross Pay · Net Deposit · Allocation ·
Pay Stub · Pay Period · Pay Date · Past Due · Ledger

---

## 2. Design principles

1. **Family defaults, per-child overrides.** Every policy is set once at the
   household level and may be overridden per child. Overrides are visibly flagged so
   divergence is auditable at a glance.
2. **Configuration must not become the burden.** Age-based starter presets,
   copy-from-sibling, and progressive disclosure keep setup from being a wall of
   thirty fields.
3. **Soft guardrails.** Nonsensical configurations produce warnings, never blocks.
   The parent is always allowed to be wrong on purpose.
4. **Append-only history.** Nothing that has posted is ever edited or deleted.
   Corrections are new, opposing entries.
5. **Reproducible history.** A pay stub from two years ago must still render exactly
   as it did, even after every setting has changed. Policy is versioned, and each
   pay stub embeds a snapshot of the policy that produced it.
6. **Durability over cleverness.** This system runs for twelve or more years and
   ends by handing a young adult a complete financial history. Boring technology,
   one-file backups, full export.

---

## 3. Hard invariants

These are non-negotiable and should be enforced in code and covered by tests.

| # | Invariant |
|---|---|
| I1 | All money is stored as **signed integer cents**. Interest accrues in **micro-cents** (10⁻⁶ cents). No floating point anywhere in the money path. |
| I2 | `ledger_entry` is append-only. No `UPDATE`, no `DELETE`. Enforced by SQLite triggers, not convention alone. |
| I3 | The sum of a pay stub's allocations equals its net deposit **exactly**. Largest-remainder distribution, remainder to the child's designated bucket. |
| I4 | Accounts flagged `visible_to_child = false`, and all bill **dispositions**, never appear in any child-facing or kiosk response. Enforced at the serialization boundary and directly tested. |
| I5 | A **posted** pay stub is immutable and carries its own policy snapshot. |
| I6 | Every account's cached balance equals the sum of its ledger entries. A nightly reconciliation job asserts this and alerts on drift. |
| I7 | Children are **archived**, never deleted. Ledger history outlives participation. |
| I8 | Excused occurrences reduce **potential** pay, never appearing as unearned pay. |
| I9 | Earned pay for a responsibility can never exceed its scaled period value. |
| I10 | **Trust never touches money.** No Track B action writes a ledger entry, alters a balance, or changes earned pay. Trust may gate *eligibility for future opportunity*; it may never reduce pay for work already done. |
| I11 | Trust status never appears on a shared or multi-child view. What a child sees of their own trust is governed by `trust.child_visibility`; the **recovery timeline is always shown**, the numeric load and the house-rule tariff only when a parent opts in (§12.2.1). |

---

## 4. Data model

SQLite. Money in integer cents. Timestamps in UTC, rendered in the household
timezone.

### 4.1 Identity and structure

**`household`** — single row in practice, but everything is scoped to it so a second
household is never a migration.
`id, name, timezone, week_start_day, created_at`

**`user`** — a login.
`id, household_id, email, password_hash, display_name, role, child_id?, active, created_at, last_login_at`

- `role` ∈ `parent` | `child`
- `child_id` links a child login to its child record. Null for parents.

**`child`** — a participant. Created and managed by parents only.
`id, household_id, display_name, birthdate, photo_blob_id?, status, joined_at, graduated_at?, sort_order`

- `status` ∈ `pre_participant` | `active` | `graduated` | `archived`
- **Age is always derived from `birthdate`.** Never stored.

**`device`** — a kiosk.
`id, household_id, name, token_hash, dashboard_mode, last_seen_at, active`

### 4.2 Policy (versioned, effective-dated)

**`policy_version`**
`id, scope_type, scope_id, effective_from, payload_json, created_by_user_id, created_at, note`

- `scope_type` ∈ `household` | `child`
- Resolution for a child on date *D*:
  `deep_merge( household policy as-of D, child policy as-of D )`
- Changing a setting **inserts a new row**. Nothing is mutated. A year of history
  never silently rewrites itself.
- Belt and braces: every pay stub and bill instance also stores its **resolved
  policy snapshot**, so history survives even a schema change.

The payload is JSON. With ~30 settings this is the right call — a normalized column
per setting would be a migration treadmill for no benefit.

### 4.3 Accounts and the ledger

**`account`**
`id, child_id, type, visible_to_child, created_at`

- `type` ∈ `checking` | `savings` | `generosity` | `held`
- `held` is the parent-only account where bills with a *held-for-child* disposition
  accumulate. This is how "how much of my bank account is actually Ava's?" gets
  answered. `visible_to_child = false`, always. **Rent is not an account.**

**`goal`**
`id, child_id, name, target_cents, photo_blob_id?, status, created_at, achieved_at?, sort_order`

- `status` ∈ `active` | `achieved` | `cancelled`

**`ledger_entry`** — the append-only core.

```
id                household_id      child_id
account_id        goal_id?          amount_cents (signed)
type              occurred_at       posted_at
description       memo?
actor_user_id?    source            reverses_entry_id?
paystub_id?       bill_instance_id?  job_claim_id?
transfer_group_id?
```

- `type` ∈ `opening_balance` · `payroll_deposit` · `bonus_deposit` ·
  `cash_deposit` · `cash_withdrawal` · `purchase` · `bill_charge` ·
  `bill_payment` · `past_due_recovery` · `transfer_in` · `transfer_out` ·
  `earmark_in` · `earmark_out` · `interest` · `donation` · `adjustment` ·
  `reversal`
- `source` ∈ `payroll` | `manual` | `system` | `kiosk`
- Transfers are **two entries** sharing a `transfer_group_id`. Double-entry-lite.
- Corrections set `reverses_entry_id`. The original stays.

**Savings sub-buckets.** Goals are modeled through `goal_id` on the ledger entry,
not as separate accounts:

| Figure | Derivation |
|---|---|
| Total savings | `SUM(amount) WHERE account = savings` |
| General (unearmarked) savings | `SUM(amount) WHERE account = savings AND goal_id IS NULL` |
| A goal's balance | `SUM(amount) WHERE goal_id = X` |

Earmarking is a `earmark_out` / `earmark_in` pair inside the savings account. Both
the real savings balance and the general balance are always displayed.

### 4.4 Responsibilities

**`responsibility`**
`id, child_id, name, icon?, weekly_value_cents, cadence, days_of_week?, max_occurrences?, active, effective_from, archived_at?, sort_order`

| Cadence | Meaning | Chances/week | Example |
|---|---|---|---|
| `daily` | Every day | 7 | Make bed, $3.50/wk → $0.50/day |
| `daily_selected` | Specific weekdays | count of selected days | Trash Tue+Fri, $2.00/wk → $1.00 each |
| `weekly` | Once in the period | 1 | Clean room, $2.00/wk |
| `up_to_n` | Optional, capped | `max_occurrences` | Vacuum up to 3×, $3.00/wk → $1.00 each |

`up_to_n` differs only in framing: partial completion is *expected*, so the UI
presents it as opportunity rather than a miss.

**`completion`**
`id, responsibility_id, child_id, occurrence_date, occurrence_index, status, claimed_by_user_id?, decided_by_user_id?, claimed_at, decided_at?, pay_period_id?`

- `status` ∈ `claimed` | `approved` | `rejected` | `excused`
- `occurrence_index` disambiguates multiple same-day completions under `up_to_n`.

**`excusal`** — vacation, illness, "at grandma's."
`id, child_id, start_date, end_date, reason, scope, responsibility_ids?`

Excused occurrences are removed from the **chances** denominator. Potential pay
drops; earned pay is untouched. Per **I8**, a sick week never looks like a failed
week.

### 4.5 Job board

**`job`**
`id, household_id, name, description?, photo_blob_id?, value_cents, eligible_child_ids, repeat_rule, repeat_n?, limit_scope, limit_count, claim_expiry_hours, allocation_mode, requires_approval, active, created_at`

- `repeat_rule` ∈ `once` | `weekly` | `monthly` | `every_n_days`
- `limit_scope` ∈ `per_child` | `global` — per job. Answers "can both kids vacuum
  this week, or is it first-come?"
- `allocation_mode` ∈ `inherit` | `checking_only`, with per-child override
- `claim_expiry_hours` prevents a child from squatting on a claimed job

**`job_claim`**
`id, job_id, child_id, claimed_at, expires_at, status, submitted_at?, decided_by_user_id?, decided_at?, value_cents_snapshot, pay_period_id?`

- `status` ∈ `claimed` | `submitted` | `approved` | `rejected` | `expired`
- Job pay is **Bonus Pay** on the pay stub — a separate line from base earnings. It
  is not part of Potential Pay.

### 4.6 Bills

Rent is not special. It is a bill whose disposition is *held for the child*.

**`bill`**
`id, child_id, name, amount_cents, cadence, due_day, nonexistent_date_rule, disposition, source_account_order, may_use_earmarked, autopay, shortfall_policy, past_due_recovery, past_due_cap_cents?, active, effective_from, archived_at?`

- `cadence` ∈ `weekly` | `monthly`
- `nonexistent_date_rule` ∈ `next_day` (default, matches commercial practice) |
  `previous_day` — for a bill due on the 31st in February
- `disposition` ∈ `held_for_child` | `disappears` | `family_fund` — **parent-only
  data, never rendered to a child (I4)**
- `source_account_order` — e.g. `["checking"]` or `["checking", "savings"]`
- `may_use_earmarked` — default `false`. Goal money is protected from bills unless
  a parent explicitly opts in.

Bills belong to a child. The creation UI can fan one bill out to several children
at once, but the records are per-child so amounts can diverge.

**`bill_instance`**
`id, bill_id, child_id, due_date, amount_cents, paid_cents, status, generated_at, paid_at?, policy_snapshot_json`

- `status` ∈ `scheduled` | `due` | `partially_paid` | `paid` | `past_due` | `waived`

**`past_due`** — derived from unpaid `bill_instance` rows; recovered per policy.

### 4.7 Payroll

**`pay_period`** — per child, since pay schedules are a per-child policy.
`id, child_id, start_date, end_date, pay_date, status, created_at`

- `status` ∈ `open` | `closed` | `drafted` | `posted`

**`paystub`**
`id, child_id, pay_period_id, status, potential_cents, earned_cents, bonus_cents, gross_cents, past_due_recovered_cents, net_cents, allocations_json, policy_snapshot_json, computed_at, revision_window_ends_at, posted_at?, revision_count, last_revised_by_user_id?`

- `status` ∈ `draft` | `posted` | `void`

**`paystub_line`**
`id, paystub_id, kind, ref_id?, label, potential_cents, earned_cents, detail_json`

- `kind` ∈ `responsibility` | `job` | `adjustment` | `past_due_recovery`

### 4.8 Interest

**`interest_accrual`** — one row per account per day.
`id, child_id, account_id, accrual_date, basis_balance_cents, annual_rate_bp, accrued_micro_cents, posted_at?`

Daily accrual on a $40 balance at 12% APR is $0.0132 — sub-cent. Accruing in
integer micro-cents and posting rounded cents monthly is the only way this stays
exact.

**Lifetime interest earned** = `SUM(amount) WHERE type = 'interest'`. No separate
counter to drift out of sync.

### 4.9 Approvals, notifications, media, audit

**`approval_request`**
`id, child_id, kind, amount_cents?, target_json, status, note?, requested_at, decided_by_user_id?, decided_at?`

- `kind` ∈ `savings_withdrawal` | `purchase` | `donation` | `goal_break` |
  `job_submission`

**`notification_channel`** — `id, user_id, kind, config_json, active`
**`notification_rule`** — `id, scope_type, scope_id, event_type, enabled, lead_time_minutes?, quiet_hours_json`
**`notification_log`** — `id, event_type, channel_id, payload_hash, sent_at, result` (dedupe + debugging)

**`push_subscription`** — one row per user per installed device.
`id, user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, last_success_at?, failure_count, expired_at?`

A user has several: one per phone, per iPad, per re-install. Subscriptions die
silently — the server prunes on `404`/`410` from the push service and the client
re-subscribes on every launch.

**`blob`** — `id, household_id, mime, bytes, width, height, byte_size, sha256, created_at`

Upload accepts **any file size**. The server downscales (longest edge 1024px for
goal images, 512px for avatars), re-encodes to WebP, caps the stored derivative at
~200 KB, and discards the original. Storing derivatives as blobs inside SQLite
preserves the "backup is one file" guarantee.

**`audit_log`** — `id, actor_user_id, action, entity_type, entity_id, before_json, after_json, at`
Covers settings changes, approvals, reversals, and raises.

---

## 5. Settings catalog

Every setting: household default, per-child override. **[ASSUMPTION]** marks a
default chosen without an explicit decision.

### 5.1 Household-wide

| Setting | Default |
|---|---|
| `timezone` | System **[ASSUMPTION]** |
| `week_start_day` | Monday **[ASSUMPTION]** |
| `kiosk.dashboard_mode` | `roster` |
| `guardrails.enabled` | on |
| `app_url` | — (required before notifications work) |
| `vapid_public_key` / `vapid_private_key` | generated at setup; private key excluded from exports |
| `vapid_contact` | — (`mailto:` or `https:`, required by Apple) |

### 5.2 Pay schedule

| Setting | Default |
|---|---|
| `pay.cadence` | `weekly` |
| `pay.period_start_day` | Monday **[ASSUMPTION]** |
| `pay.period_end_day` | Sunday **[ASSUMPTION]** |
| `pay.pay_date_offset_days` | +5 (period ends Sunday, pay date Friday) **[ASSUMPTION]** |
| `pay.cutoff_time` | 20:00 **[ASSUMPTION]** |
| `pay.min_revision_hours` | 12 — applies only when pay date equals period end |

The revision window is naturally the gap between period end and pay date. The
minimum only matters if a parent collapses that gap to zero.

### 5.3 Completion

| Setting | Default | Options |
|---|---|---|
| `completion.mode` | `auto_approve_with_veto` | `claim_then_approve`, `parent_marks_only` |
| `completion.who_can_claim` | `child_kiosk` | `parent_only` |
| `completion.excusals_enabled` | on | |

`auto_approve_with_veto`: whatever is marked done stands unless a parent objects
before the pay stub posts. This is the setting that makes follow-through automatic.

### 5.4 Allocation

| Setting | Default |
|---|---|
| `allocation.checking_pct` | 60 **[ASSUMPTION]** |
| `allocation.savings_pct` | 20 **[ASSUMPTION]** |
| `allocation.generosity_pct` | 20 **[ASSUMPTION]** |
| `allocation.rounding_bucket` | `checking` **[ASSUMPTION]** |
| `allocation.job_pay_mode` | `inherit` |

Percentages must total 100 — guardrail warning if not.

### 5.5 Interest

| Setting | Default |
|---|---|
| `interest.enabled` | on |
| `interest.accounts` | `["savings"]` |
| `interest.annual_rate_bp` | 1200 (12% APR ≈ 1%/month) **[ASSUMPTION]** |
| `interest.compounding` | `compound` |
| `interest.posting_day_of_month` | 1 |
| `interest.applies_to_earmarked` | yes — posts to general savings |

12% is deliberately unrealistic. At a $40 balance a real 4% APY pays $0.13/month,
which teaches nothing a seven-year-old can perceive. Parents can dial it to reality
as the children get older.

### 5.6 Transfers

| Movement | Default |
|---|---|
| Checking → Savings | free |
| Savings → Checking | requires parent approval (per-child override to free) |
| Earmark (general → goal) | free |
| Un-earmark (goal → general) | requires approval **[ASSUMPTION]** — "breaking a goal" should be a moment |
| Generosity out (donation) | requires approval, records recipient |
| Any → Generosity | free |

### 5.7 Bills

| Setting | Default |
|---|---|
| `bill.autopay` | on |
| `bill.source_account_order` | `["checking"]` |
| `bill.may_use_earmarked` | off |
| `bill.shortfall_policy` | `partial_pay_carry_remainder` |
| `bill.past_due_recovery` | `from_gross_before_allocation` |
| `bill.past_due_max_recovery_pct` | 100 **[ASSUMPTION]** — see note |
| `bill.past_due_cap_cents` | 2× bill amount **[ASSUMPTION]** |
| `bill.nonexistent_date_rule` | `next_day` |

> **Worth reconsidering:** at 100%, a child with two weeks of past-due rent receives
> a $0.00 pay stub. Realistic, but potentially demoralizing at age six. Lowering the
> default to 50% guarantees every payday still deposits something while the debt
> still stings. Flagged for your call.

When the cap is reached, accrual stops and the parents are notified. A young child
should never be able to reach an unrecoverable position.

### 5.8 Raises

| Setting | Default |
|---|---|
| `raise.mode` | `manual` |
| `raise.scope` | `all_responsibilities` (option: selected only) |
| `raise.auto_amount_type` | `percent` |
| `raise.auto_frequency` | — (unset while manual) |

Every raise is written to the audit log and surfaced in the child's history as a
visible event. Note that many real raises are **scope** raises rather than **rate**
raises — a child does not get paid more for making the bed, they get the
opportunity to clean the bathroom for another $5/week. That is just adding an
responsibility and needs no special mechanism.

### 5.9 Visibility

| Setting | Default |
|---|---|
| `kiosk.dashboard_mode` | `roster` |
| `kiosk.show_pending_paycheck` | on |
| `kiosk.show_sibling_balances` | implied by dashboard mode |

---

## 6. Algorithms

### 6.1 Payroll — draft

Runs automatically at `period_end + cutoff_time`.

```
for each active child whose period is closing:
    policy ← resolve(child, period_end)

    potential ← 0 ; earned ← 0
    for each responsibility active during the period:
        chances   ← occurrences(cadence, period, days_of_week, max_occurrences)
                    minus excused occurrences                        # I8
        completed ← completions counted per policy.completion.mode
        value     ← weekly_value scaled to period length

        potential += value
        earned    += min( round_half_up(value × completed ÷ chances), value )   # I9

    bonus ← Σ approved job_claims in period
    gross ← earned + bonus

    recovery ← min( total_past_due,
                    gross × policy.past_due_max_recovery_pct ÷ 100 )
    net ← gross − recovery

    allocations ← largest_remainder(net, allocation percentages)
                  with remainder → policy.allocation.rounding_bucket    # I3
    job pay bypasses allocation if job_pay_mode = checking_only

    write DRAFT paystub + lines + policy snapshot     # no ledger entries yet
    notify parents: "draft ready, window closes <pay_date>"
```

**Nothing touches the ledger at draft time.** Parent revisions recompute the draft
in place. There is nothing to reverse.

### 6.2 Payroll — post

Runs automatically at `pay_date`.

```
post the draft exactly as it stands
    write ledger entries: allocation deposits, bonus deposit, past-due recovery
    mark paystub posted (immutable, I5)
    close pay period
    notify parents and child
```

After posting, the only correction mechanism is an `adjustment` ledger entry
referencing the pay stub. The stub itself never changes.

**Accrued but unpaid.** Because pay date is separate from period end, there is a
real pending-paycheck state. The kiosk shows it: *"Earned this period: $12.50 —
payday Friday."* A pending paycheck does **not** count toward covering a bill due
before pay date. That gap is the planning lesson.

### 6.3 Billing

Instances are generated ahead of time so that nudges have something to point at.

```
nightly:
    generate upcoming bill_instances
        due_date resolved via nonexistent_date_rule

on due_date, AFTER payroll posting if both fall on the same day:
    if autopay:
        needed ← amount − paid_cents
        for account in source_account_order:
            available ← balance(account)
                        minus earmarked goal money unless may_use_earmarked
            take ← min(needed, available)
            write bill_payment entry ; needed −= take

        if needed > 0:
            apply shortfall_policy
            status ← partially_paid | past_due
            past_due accrues, capped at past_due_cap_cents

    apply disposition:
        held_for_child  → deposit to the child's hidden `held` account
        family_fund     → deposit to the household fund
        disappears      → no counter-entry

    notify
```

Order on a shared date is fixed: **payroll first, then bills.** The child is always
paid before the bill draws.

### 6.4 Interest

```
nightly, for each account with interest enabled:
    basis ← end-of-day balance
            (+ unposted accrual if compounding = compound)
    accrued_micro_cents += basis × annual_rate_bp ÷ 10000 ÷ 365 × 1_000_000

monthly on posting_day:
    amount ← round_half_up(accrued_micro_cents → cents)
    if amount > 0:
        write ledger_entry(type = interest, account = savings, goal_id = NULL)
        zero the accumulator
```

Daily accrual is what real banks do — a daily periodic rate against each day's
balance, credited monthly. It is also the reason interest cannot be gamed: because
Checking → Savings transfers are free, an end-of-period basis would let a child park
everything in Savings the night before posting. With daily accrual, one day parked
earns exactly one day of interest.

### 6.5 Rounding

- Round-half-up on every conversion to cents.
- Allocation uses **largest-remainder**, so the parts always sum to the whole (I3).
- Per-occurrence responsibility values are **display-only approximations**. Actual
  earnings are computed proportionally at payroll time (§6.1), which eliminates
  rounding drift and guarantees full completion pays exactly the weekly value.

---

## 7. Interfaces

### 7.1 Kiosk

Always-on, in a common room, likely an old Surface in Edge kiosk mode. Landscape,
touch, no login — device token only.

Three dashboard modes, parent-selected:

1. **Task progress** — every child's progress for the period, side by side
2. **Balances** — every child's account balances, side by side
3. **Roster** *(default)* — children as name + photo tiles; tap one to open that
   child's balances and task list

Design constraints:

- **Children this age read unevenly.** Icons, color, progress rings, large numbers.
  The payroll aesthetic is for the parents and for children around 11+; the young
  view is pictographic.
- **Never a shame board.** Unmet responsibilities are framed as *still available to
  earn* — money on the table, not failure. Same data, opposite valence. Especially
  important when a sibling is standing right there.
- **Parent actions on the kiosk require a PIN.** Otherwise a seven-year-old walks up
  and approves their own chores.
- **Offline tolerance.** When the network drops, show last-known balances with a
  quiet *"as of 6:14pm"* stamp. Never an error screen.
- Target evergreen Chromium/Edge; avoid bleeding-edge CSS for old hardware.

### 7.2 Parent (phone-first)

Both parents are on iOS. The highest-frequency action is deducting a purchase while
standing at a checkout, so that path must be two taps from launch. Installable as a
PWA.

A recent-activity feed with actor attribution — *"Dad deducted $4.00 — 6 minutes
ago"* — is the defense against both parents entering the same transaction.

### 7.3 Child (future)

Not built initially, but modeled from day one: `user.role = 'child'` linked to a
`child` record. Roles exist in the schema before they are used, because retrofitting
authorization is the one thing that is genuinely painful.

A child account can: view everything of their own, claim completions, claim and
submit jobs, earmark toward goals, and request withdrawals, purchases, and
donations. A child account can **never** alter a balance directly.

---

## 8. Notifications

**Primary channel: W3C Web Push to an installed PWA.** The app is served over HTTPS
with a valid certificate and installed to the home screen on iOS. This is a
supported path on iOS 16.4+ and is the intended delivery mechanism. Delivery goes
through a small adapter interface so a native app (APNs) or a self-hosted fallback
can be added later without touching the event layer.

### 8.1 iOS requirements

iOS is stricter than desktop browsers in specific, non-obvious ways. All of these
are hard requirements, not recommendations:

| Requirement | Detail |
|---|---|
| **HTTPS with a publicly trusted certificate** | Self-signed will not work. The origin must also be stable — changing it invalidates every subscription. |
| **Installed to the home screen** | Web Push does not function in a Safari tab on iOS. Only the installed PWA receives push. |
| **Web App Manifest + service worker** | Manifest with `display: standalone`, service worker registered at a scope covering the app. |
| **Permission requested from a user gesture** | `Notification.requestPermission()` must be called from a direct tap. An automatic prompt on page load silently fails on iOS. |
| **VAPID keypair** | Standard application-server keys for subscribing and signing. |
| **VAPID `sub` claim** | Must be a valid `mailto:` address or `https:` URL. Apple's push service validates this and rejects malformed values. This is the "valid email address" requirement. |
| **JWT expiry ≤ 24h** | Push services reject longer-lived VAPID tokens. |
| **Every push renders a visible notification** | iOS does not support silent/data-only push for web. A service worker that receives a push without calling `showNotification()` risks having push permission revoked. |

**Install has no prompt on iOS.** There is no `beforeinstallprompt`. The app must
detect iOS Safari and display explicit instructions — *Share → Add to Home Screen* —
followed by an in-app "Enable notifications" button that runs inside a tap handler.
Getting a parent through this once, correctly, is a real onboarding step and should
be designed rather than assumed.

**Subscriptions expire.** Removing and re-adding the home screen app destroys the
subscription and resets permission. The client re-subscribes on launch and reconciles
against the server; the server prunes on `404`/`410`.

### 8.2 Configuration

These are household-level and must be set before notifications can work:

- `app_url` — the canonical HTTPS origin. Used for the manifest, service worker
  scope, and deep links in notification payloads.
- `vapid_public_key` / `vapid_private_key` — generated once at setup; the private
  key is a secret and must be excluded from exports.
- `vapid_contact` — the `mailto:` or `https:` value for the `sub` claim.

Rotating the VAPID keypair invalidates every existing subscription and forces every
device to re-subscribe. Worth a confirmation dialog.

### 8.3 Notifications are never load-bearing

Focus modes, Low Power Mode, and the notification summary can all delay or batch
delivery. Nothing in the system may depend on a notification being seen: payroll
drafts and posts on schedule whether or not anyone read the alert, bills draw on
their due date regardless, and the kiosk plus in-app state remain the source of
truth. Notifications are a nudge toward follow-through, never a step in it.

### 8.4 Event catalog

| Event | Audience | Default |
|---|---|---|
| `payroll_draft_ready` | parents | on |
| `payroll_posted` | parents, child | on |
| `bill_due_soon` | parents, child | on, 3 days ahead |
| `bill_shortfall_predicted` | parents, child | on |
| `bill_past_due` | parents | on |
| `past_due_cap_reached` | parents | on |
| `completion_claimed` | parents | off (digest instead) |
| `job_submitted` | parents | on |
| `approval_requested` | parents | on |
| `goal_reached` | parents, child | on |
| `interest_posted` | child | on |

**The nudge** is the single most important notification, because it is where the
planning lesson actually lands:

> Rent is due in 3 days. You have $12.00. You need $15.00.

It appears as a kiosk banner and a parent push. It will be too abstract at six and
exactly right at nine — build it now regardless.

---

## 9. Guardrails

Warnings, never blocks (§2.3).

- Allocation percentages do not total 100
- A bill exceeds realistic weekly earnings → permanent past-due
- Past-due cap unset while recovery is 100% → possibility of repeated $0 pay stubs
- Interest enabled on Checking while Checking → Savings transfers are free
- A child has active goals but Savings → Checking is set to free (goals become
  advisory)
- An responsibility's weekly value is zero
- Pay date precedes period end
- A child is `active` with no responsibilities defined

---

## 10. Technology and deployment

Self-hosted. TLS and routing are the operator's responsibility.

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | One language across server and client |
| Framework | Next.js (App Router) | Server-rendered, PWA-capable, boring in 2038 |
| Database | **SQLite** (better-sqlite3 + Drizzle) | One file. Trivially backed up, trivially readable in twelve years. A single household's data is tiny; Postgres buys nothing and costs an ops surface. |
| Styling | Tailwind | |
| Auth | Session cookies, Argon2id | Device tokens for kiosks, PIN for kiosk parent actions |
| Jobs | in-process cron | Single instance; no queue infrastructure needed |
| Notifications | W3C Web Push (VAPID) behind an adapter interface | Installed PWA on iOS; adapter allows a native APNs client later |
| PWA | Manifest + service worker | Required for iOS push; also gives parents a home-screen icon |
| Packaging | Docker Compose, one container + one volume | |

**Backups and durability**

- Nightly `VACUUM INTO` snapshot with N-day retention
- Full JSON + CSV export on demand — the thing you hand a young adult at eighteen
- Printable pay stubs
- Reconciliation job asserting I6 nightly

---

## 11. Build order

Each phase should leave the system usable.

| Phase | Contents |
|---|---|
| **0 — Foundation** | Docker, SQLite, migrations, auth, household + child CRUD, photo pipeline, backups |
| **1 — Ledger** | Accounts, append-only ledger with triggers, manual money: cash deposit/withdrawal, purchases, adjustments, transfers. *Useful on its own from day one.* |
| **2 — Payroll** | Responsibilities, completions, excusals, pay periods, draft/post, pay stubs, policy versioning + snapshots |
| **3 — Notifications** | PWA manifest + service worker, iOS install onboarding, VAPID setup, Web Push subscription lifecycle, rules, payroll alerts. Early, because follow-through depends on it. |
| **4 — Bills** | Bills, instances, autopay, shortfall, past-due recovery, dispositions, held account, the nudge |
| **5 — Kiosk** | Three dashboard modes, child detail view, PIN gate, offline tolerance |
| **5b — Trust** | Trust areas, house rules, marks with leaky-bucket drain, levels, focus note, privilege catalogue, child-facing readiness view. Ships beside the kiosk because that is where visibility rules bite. |
| **6 — Goals** | Multiple goals per child, earmarking, goal photos, progress |
| **7 — Interest** | Daily accrual, monthly posting, lifetime-earned display |
| **8 — Job board** | Jobs, claims, expiry, repeat and limit rules, bonus pay |
| **9 — Settings polish** | Age-based presets, copy-from-sibling, progressive disclosure, override badges, guardrails |
| **10 — Child accounts** | Child role activation, restricted views, request flows |
| **11 — Long term** | Full export, printable stubs, graduation flow, history views |

---

## 12. Track B — Trust and privileges

Track A answers *what did you earn?* Track B answers *what are you ready for?*
They are deliberately separate systems, and invariant I10 keeps them that way.

### 12.1 Why trust is not a currency

Money and trust look parallel but behave nothing alike, and conflating them
reintroduces exactly the transactional thinking this track exists to avoid.

| | Money | Trust |
|---|---|---|
| Owned by | the child | the parent |
| Shape | a number and a ledger | a state and a sentence |
| Earned by | completing responsibilities | showing good judgment |
| Spent on | things | nothing — it is not spent |
| Unlocks | purchases, goals, giving | privileges, freedom, independence |

The consequence for the UI: money gets digits, history, and a running total.
Trust gets a colour and a note. **No streaks, no percentages, no history graph
shown to a child.** The moment trust displays a running score to the person being
measured, it has become the behaviour chart this design is trying to replace.

### 12.2 The mechanism: a leaky bucket

Each child has a **trust load** per area — an integer that rises when a parent
records an infraction and drains steadily with time. More marks means a longer
climb back, which is the property that makes it feel real rather than arbitrary.

This is a leaky bucket, and its real-world analogue is **driver's licence demerit
points**: infractions add points, time removes them, and enough accumulation
costs you privileges. That analogue is worth preserving deliberately — this
application already models payroll, banking, and rent, and modelling demerit
points fits the same "this is how the adult world works" thesis.

**Time drains the bucket; parents do not have to.** This is the single most
important property of the design. On the money track, a parent who does nothing
still produces the right outcome: payroll runs, the child gets paid. Trust must
have the same asymmetry, or forgetting to reset a status becomes a silent
punishment that runs for a week over something neither party remembers. A
constant drain means **doing nothing heals**.

**Credits cannot be banked.** Positive marks subtract from the load, but the load
floors at zero. A child can accelerate their own recovery; a child cannot bank
goodwill against a bad afternoon they have not had yet. That distinction is the
whole line between *making it right* and *buying an indulgence*, and it is why
the floor is a hard rule rather than a setting.

**The load is capped, and the cap is a setting.** Without a ceiling, one
catastrophic afternoon creates a two-week hole, which is a sentence rather than a
consequence. The cap is per-area with a per-child override, because a fifteen
year old can reasonably carry a longer consequence than a seven year old — and
because the same child needs a different ceiling at seven and at fifteen.

**Consequence proximity is a design constraint.** A consequence too far removed
from the action stops teaching and just feels like weather. This is the reason
the defaults drain fast (§12.9) and the reason the guardrails warn on long
recoveries scaled to the child's age (§12.11). As children get older the drain
slows and the cap rises; the starter presets move both together.

### 12.2.1 Should the child see the points?

Yes — but the child-facing unit is **time, not points**.

There is a real distinction between two things that both look like "showing the
score":

- **The balance and the recovery timeline** — *"you have 3 marks; one clears
  every morning; you're back to Trusted on Thursday."* This teaches duration and
  agency. It makes "this is how long it takes to undo what I did" concrete, which
  is the single most valuable thing this mechanism can convey.
- **The tariff** — a browsable price list saying hitting costs 2 and not
  listening costs 1. This invites arithmetic. A child sitting at zero who knows
  hitting costs 2, and knows 2 clears by tomorrow, has been handed a quote.

The first is worth showing. The second is the transactional failure mode wearing
the first one's clothes. So weights are revealed **when a mark is recorded**
("that one was a 2"), not published in advance as a menu.

A child will infer the rough tariff from experience within a few weeks, and that
is fine — that is how consequences are learned everywhere else. The difference
between learning it through experience and reading it off a laminated card is the
difference between a consequence and a vending machine.

**Therefore the primary child-facing display is a recovery timeline, not a
number.** "Back to Trusted: Thursday morning" is the same information as "3
marks" expressed in the unit the lesson is actually about, and a seven year old
understands Thursday far better than they understand 3.

Numeric load visibility is a three-position setting per child (§12.9):

| Mode | Child sees | Suited to |
|---|---|---|
| `level_only` | Their level and the recovery timeline | Young children |
| `show_load` | The above plus the numeric load | ~8 and up |
| `show_tariff` | The above plus house-rule weights | Teens, where the licence analogy lands and transparency outweighs pricing |

### 12.3 Areas

Trust is domain-specific. A child can be entirely reliable at home and unkind
with one particular friend, and losing television over the second one teaches
nothing about the first.

Areas are **entirely parent-defined** — add, rename, reorder, or delete them.
The shipped set is a starting point, not a structure to work within, and a
household that wants one general area plus nothing else should get exactly that.
Having the framework is often enough on its own: an untracked area can still be
useful purely as a place to hang a privilege.

Shipped defaults, all editable:

| Area | Covers |
|---|---|
| Home | Following directions, respect, cleaning up |
| Friendships | Kindness, sharing, handling disagreement |
| Screens | Stopping when asked, honesty about time |
| Out & About | Staying close, safety, independence away from home |

House Rules are tagged to an area, so an infraction lands in the right bucket.
Privileges are tagged to an area and a minimum level.

### 12.4 Levels

Four levels per area, derived from the load. Names are what a child sees, and the
lowest one carries its own time bound so that tomorrow is visibly a fresh start.

| Level | Default name | Default load | Meaning |
|---|---|---|---|
| 3 | Trusted | 0 | Everything appropriate for their age |
| 2 | Working on it | 1–2 | Some privileges paused |
| 1 | Not ready today | 3–4 | Most privileges in this area paused |
| 0 | Taking a break | 5+ | This area is on hold; parent conversation required |

A parent can also **pin** a level directly, overriding the computed one. Pins
carry an expiry (default: end of day) and appear in the parent's nudge queue,
because an un-expiring manual pin is the silent-punishment failure mode
returning by another door.

### 12.5 Communicate, do not enforce

The application does **not** disable the television. It answers *what am I ready
for today?* and removes the "but you never said" argument. Enforcement would put
a child in an argument with a screen instead of a conversation with a parent,
which loses the entire point.

The privilege catalogue is therefore **optional infrastructure**. Trust levels
plus a single focus note are the durable core; the catalogue is a convenience
that will go stale if it is not maintained, and the system must stay useful when
it is empty.

### 12.6 Today's Focus

One optional free-text line per child: *"Working on: listening the first time."*

**One item, never a list.** A list of a child's failings rendered on a screen is
a shame board regardless of the words chosen. Expires by default at end of day.

### 12.7 Visibility

| Surface | Shows |
|---|---|
| Kiosk roster (shared) | **Nothing.** No colour, no status, no indicator (I11) |
| Child's own detail view | Their level per area, **the recovery timeline**, their focus note, what they are ready for. Numeric load and weights per `trust.child_visibility` (§12.2.1) |
| Parent views | Everything: load, marks, history, pins |

Trust is deliberately absent from every side-by-side view. A red state next to a
sibling's green state converts a private conversation into a scoreboard, and
produces exactly the comparison dynamic the money track already has to manage.

### 12.8 Data model

**`trust_area`**
`id, household_id, name, icon?, drain_amount, drain_interval_hours, cap_load, thresholds_json, sort_order, active`

**`trust_area_override`** — per-child drain and cap, so one area can move at
different speeds for a seven year old and a fifteen year old.
`child_id, trust_area_id, drain_amount?, drain_interval_hours?, cap_load?`

**`house_rule`** — tier 1. Concrete and observable, never scored, never paid.
`id, household_id, trust_area_id, text, default_weight, active, sort_order`

Wording matters here: *"follow directions the first time"* is observable;
*"have a good attitude"* is not measurable and should be guarded against in the
UI copy.

**`trust_mark`** — the append-only-ish log of what happened.
`id, child_id, trust_area_id, house_rule_id?, weight, note?, occurred_at, created_by_user_id, retracted_at?`

- Positive weight = infraction; negative = credit.
- **Unlike the ledger, a mark may be retracted.** This is a parenting tool, not a
  financial record. A parent who marked something in anger must be able to undo
  it cleanly, and requiring a compensating entry to erase an unfair mark would be
  both bad UX and bad parenting.

**`trust_state`** — the cached bucket, same pattern as `account.balance_cents`.
`child_id, trust_area_id, load, last_drained_at, pinned_level?, pin_expires_at?, updated_at`

Drain is applied lazily on read and persisted on write:

```
elapsed  = now − last_drained_at
periods  = floor(elapsed ÷ drain_interval)
load     = max(0, load − periods × drain_amount)
last_drained_at += periods × drain_interval
```

**`privilege`**
`id, household_id, trust_area_id, name, icon?, min_level, active, sort_order`

**`focus_note`**
`id, child_id, text, created_by_user_id, created_at, expires_at`

### 12.9 Settings

Every setting below is a household default with a per-child override, and the
drain and cap are additionally per-area.

| Setting | Default |
|---|---|
| `trust.enabled` | on |
| `trust.drain_amount` | 2 |
| `trust.drain_interval_hours` | 12 |
| `trust.drain_anchor_hour` | 06:00, so a day visibly starts fresh |
| `trust.cap_load` | 6 |
| `trust.child_visibility` | `level_only` (§12.2.1) |
| `trust.pin_default_expiry` | end of day |
| `trust.gates_bonus_jobs` | available, **opt-in per job**, default off |

The defaults drain fast on purpose: 2 points every 12 hours against a cap of 6
means even a worst-possible day is back to Trusted inside two days. For a six or
seven year old that is the right end of the range — a consequence they cannot see
the end of has stopped teaching and become weather. Expect to hit the cap
regularly at first; that is the system working, not misconfigured.

**Age presets move drain and cap together**, in opposite directions:

| Band | Drain | Cap | Worst case |
|---|---|---|---|
| 5–7 | 2 / 12h | 6 | ~1.5 days |
| 8–10 | 2 / 24h | 8 | 4 days |
| 11–13 | 1 / 24h | 10 | 10 days |
| 14+ | 1 / 24h | 14 | 2 weeks |

### 12.10 Trust gating paid opportunity

A bonus job may require a minimum trust level in a chosen area. This is the one
sanctioned point of contact between the tracks, and it is bounded by I10:

- **Permitted:** trust blocks a child from *claiming* a job they are not ready
  for. You do not get promoted if you are not trustworthy.
- **Forbidden:** trust reducing earned pay, altering an allocation, touching a
  balance, or affecting a job already claimed and completed.

Opt-in per job, default off, so gating is a deliberate decision each time rather
than an ambient condition on the whole board.

### 12.11 Guardrails

- A privilege requires a level its area's thresholds can never produce
- **Worst-case recovery exceeds what is age-appropriate** — `cap_load ÷
  drain_amount` compared against a threshold scaled to the child's derived age
  (3 days under 8, 7 days to 12, 14 days above). This is the consequence-proximity
  constraint from §12.2 expressed as a warning rather than a limit.
- A house rule is worded as an emotion rather than an observable behaviour
  (heuristic warning on words like *attitude*, *nice*, *good*)
- A child sits at level 0 or 1 for more than three days — nudges the parent to
  confirm it is still accurate

---

## 13. Open items

1. **`past_due_max_recovery_pct` default** — 100% (realistic) or 50% (never a $0
   payday)? §5.7.
2. **Graduation.** What happens at eighteen: the held/rent fund reveal, a final
   statement, cash-out of remaining balances. Needs a defined ceremony before a
   child gets close.
3. **Child login age** — undecided, deferred to phase 10.
4. **Starter preset bands** — proposed 5–7, 8–10, 11–13, 14+. Content to be defined.
5. **Teens and Track B.** The trust mechanism is tuned for children young enough
   that a bounded, mechanical recovery is legible. Whether it stays the right
   tool at fifteen — or whether privileges by then are better handled entirely by
   conversation — is an open question worth revisiting before the eldest gets
   there. The age presets in §12.9 assume it remains useful; that assumption is
   untested.
6. **House rule starter content.** The wording of the shipped examples matters
   more than usual, since they model the observable-not-emotional standard the
   guardrail enforces.
7. All **[ASSUMPTION]** defaults throughout §5 and §12.9.
