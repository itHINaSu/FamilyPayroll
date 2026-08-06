import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // The ledger tests open a real SQLite file through a module-level singleton,
    // so they must not share a process with another suite that does the same.
    fileParallelism: false,
  },
});
