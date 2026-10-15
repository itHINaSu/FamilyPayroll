import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, vi } from "vitest";

/**
 * `server-only` is a Next.js build-time guard with no runtime implementation.
 * Every module in the service layer imports it, so it is stubbed once here
 * rather than in each test file.
 */
vi.mock("server-only", () => ({}));

/**
 * Every test file gets its own empty database. This has to happen here,
 * before the test file imports anything: lib/config reads DATA_DIR and
 * DATABASE_PATH when it is first imported, so setting them later (in a
 * beforeAll) is too late — and every file would quietly share, and keep
 * growing, ./data/family-payroll.db instead.
 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-test-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = path.join(dataDir, "test.db");
process.env.BACKUP_DIR = path.join(dataDir, "backups");

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
