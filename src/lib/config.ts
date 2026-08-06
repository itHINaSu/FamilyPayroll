import path from "node:path";

/**
 * Runtime configuration.
 *
 * The design goal is that `docker compose up -d` works with nothing set. Only
 * five variables are ever worth touching, and every secret self-generates on
 * first boot and persists in the data volume (see lib/secrets.ts).
 */

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");

export const config = {
  dataDir: DATA_DIR,
  databasePath: process.env.DATABASE_PATH ?? path.join(DATA_DIR, "family-payroll.db"),
  backupDir: process.env.BACKUP_DIR ?? path.join(DATA_DIR, "backups"),

  /**
   * Canonical public origin. Required before Web Push works: it seeds the
   * manifest, the service worker scope, and deep links inside notifications.
   * Can also be set from the setup wizard, which is why it is optional here.
   */
  appUrl: process.env.APP_URL ?? null,

  /**
   * Container timezone. Load-bearing rather than cosmetic — pay periods, cutoff
   * times, and bill due dates are calendar arithmetic, so a wrong clock silently
   * shifts when children get paid.
   */
  timezone: process.env.TZ ?? "UTC",

  backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 30),
  backupCronHour: Number(process.env.BACKUP_HOUR ?? 3),

  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),

  isProduction: process.env.NODE_ENV === "production",
} as const;

export const IMAGE_LIMITS = {
  /** Uploads accept any size; these bound the stored derivative. */
  avatarMaxEdge: 512,
  goalMaxEdge: 1024,
  maxStoredBytes: 200 * 1024,
  quality: 82,
} as const;
