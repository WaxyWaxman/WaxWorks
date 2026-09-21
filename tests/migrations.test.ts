import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

// A-101's form, as `supabase migration new` mints it: 14-digit UTC timestamp, verb, object.
export const MIGRATION_NAME = /^\d{14}_[a-z]+_[a-z0-9_]+\.sql$/;

describe("A-101 — a migration is <UTC timestamp>_<verb>_<object>.sql, ordered by filename; the seed reaches the database through definer functions", () => {
  it("every file under supabase/migrations matches the form", () => {
    const files = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => !MIGRATION_NAME.test(f))).toEqual([]);
  });

  it("the lint refuses the shapes A-101 rejected", () => {
    for (const bad of ["0001_init.sql", "20260921012717-create-app.sql", "20260921012717_CreateApp.sql", "create_app_schema.sql", "20260921012717_x.sql"]) {
      expect(MIGRATION_NAME.test(bad), bad).toBe(false);
    }
    expect(MIGRATION_NAME.test("20260921012717_create_app_schema_and_owner.sql")).toBe(true);
  });

  it("the seed carries A-101's rules at its head: the two exceptions, claims per block, the refusal, never production", () => {
    const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
    const head = seed.slice(0, 3000);
    expect(head).toMatch(/A-101/);
    expect(head).toMatch(/definer function/i);
    expect(head).toMatch(/bootstrap/i);
    expect(head).toMatch(/A-91/);
    expect(head).toMatch(/auth\.org_id\(\)/);
    expect(head).toMatch(/already exists/i);
    expect(head).toMatch(/never.*production/i);
  });

  it("the seed inserts into no table at M0 — nothing exists to seed", () => {
    const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8").replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(seed).not.toMatch(/\binsert\s+into\b/i);
  });
});
