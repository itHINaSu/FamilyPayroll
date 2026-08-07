import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { sqlite } from "@/db";
import { config } from "@/lib/config";

/**
 * Nightly snapshot.
 *
 * `VACUUM INTO` produces a consistent, fully checkpointed copy while the
 * application keeps running — unlike copying the file, which under WAL can
 * capture a database without its unwritten pages. The result is a single file
 * that opens anywhere SQLite exists, which is the whole durability argument for
 * this project: a child's complete financial history should still be readable
 * in twelve years without this application.
 */

export function createBackup(): string {
  fs.mkdirSync(config.backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(config.backupDir, `family-payroll-${stamp}.db`);

  // VACUUM INTO refuses to overwrite, so a collision means the same second —
  // vanishingly unlikely, and retrying with a suffix is not worth the code.
  sqlite.prepare("VACUUM INTO ?").run(target);

  pruneOldBackups();
  return target;
}

export function pruneOldBackups(): number {
  if (!fs.existsSync(config.backupDir)) return 0;

  const cutoff = Date.now() - config.backupRetentionDays * 86_400_000;
  let removed = 0;

  for (const name of fs.readdirSync(config.backupDir)) {
    if (!name.startsWith("family-payroll-") || !name.endsWith(".db")) continue;

    const full = path.join(config.backupDir, name);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed++;
    }
  }

  return removed;
}

export function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];

  return fs
    .readdirSync(config.backupDir)
    .filter((n) => n.startsWith("family-payroll-") && n.endsWith(".db"))
    .map((name) => {
      const stat = fs.statSync(path.join(config.backupDir, name));
      return { name, sizeBytes: stat.size, createdAt: stat.mtimeMs };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export type RestoreResult =
  | { ok: true; safetyBackup: string }
  | { ok: false; error: string };

/**
 * Replace the live database with an uploaded backup.
 *
 * This never touches the live connection in-process — better-sqlite3 holds
 * one open handle for the app's whole lifetime (see db/index.ts), and
 * swapping the file out from under it while requests are in flight is exactly
 * the kind of thing that turns a bad upload into data loss instead of a
 * five-minute restart. So the file is validated, the current database is
 * safety-backed-up with the same consistent VACUUM INTO snapshot the nightly
 * job uses, and only then is the file replaced. The process needs restarting
 * for the swap to take effect — better a clear instruction than a silent
 * half-migrated state.
 */
export function restoreFromUpload(bytes: Buffer): RestoreResult {
  if (bytes.length < 16 || bytes.subarray(0, 16).toString("latin1") !== "SQLite format 3\0") {
    return { ok: false, error: "That file is not a SQLite database." };
  }

  fs.mkdirSync(config.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stagedPath = path.join(config.backupDir, `restore-upload-${stamp}.db`);
  fs.writeFileSync(stagedPath, bytes);

  try {
    const probe = new Database(stagedPath, { readonly: true });
    const tables = probe
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('household','ledger_entry','user')",
      )
      .all() as { name: string }[];
    probe.close();

    if (tables.length < 3) {
      fs.unlinkSync(stagedPath);
      return { ok: false, error: "That file doesn't look like a Family Payroll backup." };
    }
  } catch {
    if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
    return { ok: false, error: "That file could not be opened as a database." };
  }

  const safetyBackup = createBackup();

  for (const suffix of ["", "-wal", "-shm"]) {
    const p = config.databasePath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  fs.renameSync(stagedPath, config.databasePath);

  return { ok: true, safetyBackup };
}
