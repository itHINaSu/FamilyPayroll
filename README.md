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

```sh
docker compose up -d
```

That is the entire install. Open `http://<host>:3000` and the first-run wizard
creates your household and your parent account.

Nothing needs to be configured first: the session secret and VAPID keypair
generate themselves on first boot and persist in `./data`, so there are no
default credentials in the image and nothing to log into until you have
completed setup.

### Running from GitHub without cloning

Replace the `build` block in `docker-compose.yml` with a git context:

```yaml
services:
  app:
    build: https://github.com/<you>/FamilyPayroll.git#main
```

Then `docker compose build --pull && docker compose up -d` fetches and builds
the latest source each time.

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
│   ├── children.ts        # child records and the four accounts each one gets
│   ├── auth/              # scrypt passwords, session cookies, route guards
│   ├── images.ts          # upload -> downscale -> WebP -> blob
│   ├── backup.ts          # VACUUM INTO snapshots and retention
│   └── scheduler.ts       # in-process daily tick
└── app/
    ├── setup/             # first-run wizard
    ├── login/
    ├── (app)/             # authenticated shell: dashboard, children, settings
    └── api/               # health, blob serving
```

### The rules that matter

Nine invariants in [SPEC.md](./SPEC.md#3-hard-invariants) hold the system
together. The load-bearing ones:

- **Money is integer cents.** No floats in the money path, ever. Interest
  accrues in micro-cents and rounds exactly once, at monthly posting.
- **The ledger is append-only**, enforced by SQLite triggers rather than
  convention. Corrections are reversing entries; the original always stays.
- **Posted pay stubs are immutable** and carry a snapshot of the policy that
  produced them, so history stays reproducible after every setting has changed.
- **The `held` account is never child-visible.** It is where bills with a
  `held_for_child` disposition accumulate — the rent fund. Child-facing code
  reads `getVisibleAccounts()`, never `getAccounts()`.

`src/db/invariants.test.ts` asserts these against a real SQLite file with the
real migrations applied.

---

## Status

Phase 0 of twelve. See [SPEC.md section 11](./SPEC.md#11-build-order).

**Working now:** Docker deployment, schema and migrations, first-run setup,
parent authentication, child records with derived ages and archive-not-delete,
the four accounts per child, photo upload with automatic downscaling, nightly
backups, health checks.

**Next:** the ledger and manual money movement — cash in and out, purchases,
transfers, adjustments — which makes the app useful on its own before payroll
exists.
