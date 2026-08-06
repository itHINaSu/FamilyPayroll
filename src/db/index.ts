import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { config } from "@/lib/config";
import * as schema from "./schema";

/**
 * A single SQLite connection, migrated on first use.
 *
 * Initialization is lazy, behind a proxy, for one specific reason: `next build`
 * imports every route module to collect page data, and it does so in parallel
 * workers. If opening this module opened the database, several build workers
 * would race to run migrations against the same file and lose to SQLITE_BUSY.
 * Deferring until an actual query means the build never touches the database at
 * all, while the boot hook in instrumentation.ts still forces migrations before
 * the server accepts traffic.
 */

function createConnection() {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  fs.mkdirSync(config.backupDir, { recursive: true });

  const sqlite = new Database(config.databasePath);

  // WAL survives an unclean container stop far better than the rollback journal
  // and allows reads to continue during the nightly backup.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const database = drizzle(sqlite, { schema });

  migrate(database, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });

  return { sqlite, database };
}

// The dev server re-evaluates modules on hot reload; without the global, each
// edit would leak a file handle until the process ran out of them.
const globalForDb = globalThis as unknown as {
  __familyPayrollDb?: ReturnType<typeof createConnection>;
};

function connection() {
  if (!globalForDb.__familyPayrollDb) {
    globalForDb.__familyPayrollDb = createConnection();
  }
  return globalForDb.__familyPayrollDb;
}

type Db = ReturnType<typeof createConnection>["database"];
type Sqlite = ReturnType<typeof createConnection>["sqlite"];

export const db = new Proxy({} as Db, {
  get: (_target, prop) => Reflect.get(connection().database, prop),
});

export const sqlite = new Proxy({} as Sqlite, {
  get: (_target, prop) => {
    const value = Reflect.get(connection().sqlite, prop);
    return typeof value === "function" ? value.bind(connection().sqlite) : value;
  },
});

/** Forces the connection open and migrations to run. Called from the boot hook. */
export function initDatabase(): void {
  connection();
}

export { schema };
