// A-126 — the integration suite against local Supabase Auth. Run with
// `pnpm test:auth` after `supabase start`; it is NOT part of `pnpm test`, whose
// CI job starts no Supabase. One file at a time: the suites share one database.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/auth/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
