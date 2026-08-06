import "server-only";

import fs from "node:fs";
import path from "node:path";

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
