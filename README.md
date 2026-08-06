# Family Payroll

Teach children personal finance through a real payroll and banking model rather
than an allowance.

Children **earn** money by meeting responsibilities and never **lose** it —
unmet responsibilities mean money not earned, not money taken away. Pay runs on
a schedule, bills come due whether or not a paycheck was earned, savings earn
interest, and every transaction lands in a permanent ledger the child can be
handed when they turn eighteen.

**Earn it. Save it. Share it. Every dollar has a job.**

The full design lives in [SPEC.md](./SPEC.md).

---

## Running it

You do not need to clone anything. Create an empty directory, put a
`compose.yaml` in it, and start:

```sh
mkdir family-payroll && cd family-payroll
# paste the file below as compose.yaml
docker compose up -d
```

The image is pulled on first run. Open `http://<host>:3000` and the first-run
wizard creates your household and your parent account. There are no default
credentials in the image — until you complete setup there is nothing to log
into.

A ready-to-use file lives at [`examples/compose.yaml`](./examples/compose.yaml),
reproduced here so you can copy it without cloning:

```yaml
services:
  app:
    image: ghcr.io/ithinasu/familypayroll:latest
    container_name: family-payroll
    restart: unless-stopped

    environment:
      # The host user that should own ./data. Find yours with: id -u && id -g
      PUID: 1000
      PGID: 1000

      # Load-bearing: pay periods, cutoffs, and bill due dates are calendar
      # arithmetic in this zone. A wrong clock shifts when children get paid.
      TZ: America/Chicago

      # Your public HTTPS origin, once you have one. Required before iOS
      # notifications work; changing it later invalidates every subscription.
      APP_URL: ""

      BACKUP_HOUR: 3
      BACKUP_RETENTION_DAYS: 30

    ports:
      - "3000:3000"

    volumes:
      # The database, its WAL, and nightly snapshots. Back this up and you have
      # backed up the entire system.
      - ./data:/data

    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
```

Day to day:

```sh
docker compose pull && docker compose up -d   # upgrade
docker compose logs -f                        # watch it
docker compose down                           # stop; ./data is kept
```

### If `docker compose pull` says "denied"

GHCR returns `denied` both for an image that does not exist and for one you are
not allowed to see, so the message does not tell you which. In order of
likelihood:

1. **The package is still private.** Package visibility does **not** follow the
   repository's — making the repo public leaves the package private until you
   change it separately: *your profile → Packages → familypayroll → Package
   settings → Change visibility → Public*.
2. **Nothing has been published yet.** A branch rename does not trigger a
   workflow, and neither does flipping a repo to public. Check the Actions tab;
   the *Publish container image* run has to have succeeded at least once. You can
   start one by hand from that tab, or by pushing any commit.
3. **The tag does not exist.** See the table below for what is actually built.

If you would rather keep the package private, log in once on the machine that
runs it:

```sh
echo <TOKEN> | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin
```

`<TOKEN>` is a personal access token with `read:packages`. Note that SSH keys do
not work for this — container registries authenticate over HTTPS with tokens,
separately from however you access the repository itself.

### Tags and architectures

Images are built for `linux/amd64` and `linux/arm64`, so the same tag runs on a
NAS, a mini PC, or a Raspberry Pi.

| Tag | Published from |
|---|---|
| `:latest` | the default branch — **this is the one you want** |
| `:edge` | any non-default branch |
| `:main` | the branch name | |
| `:v1.2.0` | a git tag, for pinning a release |
| `:sha-abc1234` | a specific commit, for pinning exactly |

### Building from source instead

Clone the repository and use the `docker-compose.yml` in it — comment out
`image:` and uncomment one of the `build:` blocks. Since the repository is
public, `build: https://github.com/itHINaSu/FamilyPayroll.git#main` also
works without cloning at all.

### Environment

Everything has a working default; `docker compose up -d` runs with no `.env`
file at all. Copy `.env.example` if you want to change something.

| Variable | Default | Notes |
|---|---|---|
| `PUID` / `PGID` | `1000` | Host user that should own `./data`. Find yours with `id -u && id -g`. |
| `TZ` | `America/Chicago` | **Load-bearing.** Pay periods, payroll cutoffs, and bill due dates are calendar arithmetic in this zone. A wrong clock silently shifts paydays. |
| `PORT` | `3000` | Host port to publish on. |
| `APP_URL` | — | Your public HTTPS origin. Required before Web Push works on iOS; changing it later invalidates every push subscription. |
| `BACKUP_HOUR` | `3` | Hour of day for the nightly snapshot. |
| `BACKUP_RETENTION_DAYS` | `30` | How long snapshots are kept. |

TLS and routing are yours to provide — put this behind whatever reverse proxy
you already run.

### Data and backups

Everything lives in `./data`: the SQLite database, its write-ahead log, and the
nightly snapshots under `./data/backups`. Photos are stored as rows inside the
database rather than as loose files, so **backing up means copying one file**.

Snapshots are written with `VACUUM INTO`, which produces a consistent copy while
the app keeps running. Each one is a complete database that opens anywhere
SQLite exists — which is the durability argument for the whole project. A
child's financial history should still be readable in twelve years without this
application.

---

## Development

```sh
npm install
npm run dev          # http://localhost:3000
npm test             # money math and schema invariants
npm run typecheck
npm run build
```

Migrations are generated from the schema and applied automatically at boot:

```sh
npm run db:generate  # after editing src/db/schema.ts
```

### Layout

```
src/
├── db/
│   ├── schema.ts          # every table, with the invariants documented inline
│   ├── migrations/        # generated, plus hand-written trigger migrations
│   └── invariants.test.ts # asserts SPEC.md section 3 against a real database
├── lib/
│   ├── money.ts           # integer-cent math, allocation, interest accrual
│   ├── ledger.ts          # the one path money moves through
│   ├── policy.ts          # settings catalogue, resolution, guardrails
│   ├── payroll.ts         # draft at period end, post on payday
│   ├── bills.ts           # generation, collection, shortfall, dispositions
│   ├── interest.ts        # daily micro-cent accrual, monthly posting
│   ├── goals.ts           # savings sub-buckets and earmarking
│   ├── jobs.ts            # the bonus job board
│   ├── trust.ts           # Track B: the leaky bucket, levels, privileges
│   ├── kiosk.ts           # the ONLY child-facing serialiser (I4, I11)
│   ├── notifications.ts   # Web Push, subscription lifecycle
│   ├── nudges.ts          # the daily shortfall warning
│   ├── children.ts        # child records and the four accounts each one gets
│   ├── dates.ts           # calendar arithmetic; pay periods and due dates
│   ├── seed.ts            # starter areas, rules, privileges, age presets
│   ├── auth/              # scrypt passwords, session cookies, route guards
│   ├── images.ts          # upload -> downscale -> WebP -> blob
│   ├── backup.ts          # VACUUM INTO snapshots and retention
│   └── scheduler.ts       # in-process tick: payroll, bills, interest, backups
└── app/
    ├── setup/             # first-run wizard
    ├── login/
    ├── kiosk/             # the always-on display, paired by device token
    ├── (app)/             # parent app: children, jobs, house rules, settings
    └── api/               # health, blob serving
```

### The rules that matter

Eleven invariants in [SPEC.md](./SPEC.md#3-hard-invariants) hold the system
together. The load-bearing ones:

- **Money is integer cents.** No floats in the money path, ever. Interest
  accrues in micro-cents and rounds exactly once, at monthly posting.
- **The ledger is append-only**, enforced by SQLite triggers rather than
  convention. Corrections are reversing entries; the original always stays.
- **Posted pay stubs are immutable** and carry a snapshot of the policy that
  produced them, so history stays reproducible after every setting has changed.
- **The `held` account is never child-visible.** It is where bills with a
  `held_for_child` disposition accumulate — the rent fund. Every child-facing
  payload is assembled in `lib/kiosk.ts` and nowhere else, so this is enforced at
  one boundary rather than trusted to each template.
- **Trust never touches money.** Nothing in `lib/trust.ts` writes a ledger entry
  or alters a balance. Trust may gate access to a bonus job; it may never reduce
  pay for work already done.
- **Doing nothing produces the right outcome.** Payroll drafts and posts on
  schedule without a parent acting, and the trust bucket drains with time rather
  than needing to be cleared. Both are deliberate: a system that punishes a busy
  week is one you stop using.

`src/db/invariants.test.ts` asserts these against a real SQLite file with the
real migrations applied, and `src/lib/lifecycle.test.ts` re-checks them after a
simulated month.

---

## Status

All twelve phases of [SPEC.md](./SPEC.md) are implemented apart from child
logins, which are modelled in the schema and deliberately not issued yet.

**Track A — money**

- Append-only ledger with SQLite-enforced immutability, reversing corrections,
  and a nightly reconciliation job
- Manual money: cash in and out, purchases, donations, adjustments, transfers
- Responsibilities with four cadences, excusals, and proportional part-weeks
- Payroll that drafts itself at period end and posts itself on payday
- Bills, autopay, partial collection, past-due recovery off the next paycheck,
  and the hidden held fund behind rent
- Savings goals with earmarking, photos, and progress
- Daily interest accrual in micro-cents, posted monthly
- A job board with claims, expiry, and repeat limits

**Track B — trust**

- Parent-defined areas, house rules, and privileges
- A leaky bucket that drains with time, so doing nothing produces recovery
- Four levels, per-child drain and cap, manual pins that expire on their own
- A child-facing recovery timeline rather than a score

**Everything else**

- Household defaults with per-child overrides, effective-dated and never mutated
- Age-band starter presets and soft guardrails
- The kiosk display in three modes, paired by device token
- Web Push to an installed PWA, with the iOS install flow handled explicitly
- Nightly backups, health checks, and a Docker deployment

80 tests, including a simulated month that runs a child through four weeks of
payroll, a rent shortfall, a bonus job, a savings goal, interest, and a trust
incident, then asserts every invariant still holds.

### Not done

- **Child accounts.** Roles exist in the schema and every child-facing payload
  is already built through one guarded serialiser, but no child login is issued.
- **Graduation.** What happens at eighteen — the held-fund reveal, a final
  statement, cashing out — is deliberately still an open question in the spec.
- **Printable pay stubs and full export.** The data is all there; the rendering
  is not.
