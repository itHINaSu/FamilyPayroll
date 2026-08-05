# Family Payroll — Technical Specification

**Status:** Draft for review. No application code exists yet.
**Branch:** `claude/family-chore-app-planning-97p0kf`

This document is the agreed design coming out of the planning conversation. It is
meant to be marked up. Anything labeled **[ASSUMPTION]** is a default chosen in the
absence of an explicit decision and can be struck without argument.

---

## 1. Product summary

Family Payroll is a self-hosted web application that teaches children personal
finance by modeling a real payroll and banking system. Children earn money by
meeting expectations, get paid on a schedule, pay recurring bills, save toward
goals, earn interest, and give money away — all recorded in a permanent ledger.

**Core philosophy**

- Children **earn**; they never **lose**. Unmet expectations mean money not earned,
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
| I9 | Earned pay for an expectation can never exceed its scaled period value. |

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

### 4.4 Expectations

**`expectation`**
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
`id, expectation_id, child_id, occurrence_date, occurrence_index, status, claimed_by_user_id?, decided_by_user_id?, claimed_at, decided_at?, pay_period_id?`

- `status` ∈ `claimed` | `approved` | `rejected` | `excused`
- `occurrence_index` disambiguates multiple same-day completions under `up_to_n`.

**`excusal`** — vacation, illness, "at grandma's."
`id, child_id, start_date, end_date, reason, scope, expectation_ids?`

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

- `kind` ∈ `expectation` | `job` | `adjustment` | `past_due_recovery`

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
| `raise.scope` | `all_expectations` (option: selected only) |
| `raise.auto_amount_type` | `percent` |
| `raise.auto_frequency` | — (unset while manual) |

Every raise is written to the audit log and surfaced in the child's history as a
visible event. Note that many real raises are **scope** raises rather than **rate**
raises — a child does not get paid more for making the bed, they get the
opportunity to clean the bathroom for another $5/week. That is just adding an
expectation and needs no special mechanism.

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
    for each expectation active during the period:
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
- Per-occurrence expectation values are **display-only approximations**. Actual
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
- **Never a shame board.** Unmet expectations are framed as *still available to
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
- An expectation's weekly value is zero
- Pay date precedes period end
- A child is `active` with no expectations defined

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
| **2 — Payroll** | Expectations, completions, excusals, pay periods, draft/post, pay stubs, policy versioning + snapshots |
| **3 — Notifications** | PWA manifest + service worker, iOS install onboarding, VAPID setup, Web Push subscription lifecycle, rules, payroll alerts. Early, because follow-through depends on it. |
| **4 — Bills** | Bills, instances, autopay, shortfall, past-due recovery, dispositions, held account, the nudge |
| **5 — Kiosk** | Three dashboard modes, child detail view, PIN gate, offline tolerance |
| **6 — Goals** | Multiple goals per child, earmarking, goal photos, progress |
| **7 — Interest** | Daily accrual, monthly posting, lifetime-earned display |
| **8 — Job board** | Jobs, claims, expiry, repeat and limit rules, bonus pay |
| **9 — Settings polish** | Age-based presets, copy-from-sibling, progressive disclosure, override badges, guardrails |
| **10 — Child accounts** | Child role activation, restricted views, request flows |
| **11 — Long term** | Full export, printable stubs, graduation flow, history views |

---

## 12. Open items

1. **`past_due_max_recovery_pct` default** — 100% (realistic) or 50% (never a $0
   payday)? §5.7.
2. **Graduation.** What happens at eighteen: the held/rent fund reveal, a final
   statement, cash-out of remaining balances. Needs a defined ceremony before a
   child gets close.
3. **Child login age** — undecided, deferred to phase 10.
4. **Starter preset bands** — proposed 5–7, 8–10, 11–13, 14+. Content to be defined.
5. All **[ASSUMPTION]** defaults throughout §5.
