// Repository-level checks. These hold the M0 foundation order's rows that no
// workspace member owns: they read the tree, not a module.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("A-102 — pnpm workspaces, no monorepo task runner, tsc and ESLint per member", () => {
  it("pnpm-workspace.yaml lists apps/*, packages/* and e2e, and not prototype/", () => {
    // Only the list entries count — a comment may name prototype/ to say why it is absent.
    const entries = read("pnpm-workspace.yaml")
      .split("\n")
      .filter((l) => /^\s*-\s/.test(l))
      .map((l) => l.replace(/^\s*-\s*/, "").replace(/["']/g, "").trim());
    expect(entries).toEqual(expect.arrayContaining(["apps/*", "packages/*", "e2e"]));
    expect(entries.some((e) => e.includes("prototype"))).toBe(false);
  });

  it("no Turborepo or Nx configuration exists", () => {
    for (const f of ["turbo.json", "nx.json", "lerna.json"]) {
      expect(existsSync(join(root, f)), f).toBe(false);
    }
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).filter((d) => /^(turbo|nx|@nx\/)/.test(d))).toEqual([]);
  });

  it("root scripts typecheck, lint and test exist and call members directly", () => {
    const pkg = JSON.parse(read("package.json"));
    for (const s of ["typecheck", "lint", "test"]) {
      expect(pkg.scripts?.[s], s).toBeTruthy();
      expect(pkg.scripts[s]).toMatch(/pnpm\s+(-r|--recursive|--filter)/);
    }
    expect(pkg.packageManager).toMatch(/^pnpm@/);
  });

  it("the lockfile is committed", () => {
    expect(existsSync(join(root, "pnpm-lock.yaml"))).toBe(true);
  });
});
