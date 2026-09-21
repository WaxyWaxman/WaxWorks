// Repository-level checks. These hold the M0 foundation order's rows that no
// workspace member owns: they read the tree, not a module.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

  it("every workspace member answers typecheck — --if-present must skip nothing", () => {
    // A-102 is `tsc --noEmit` PER MEMBER. The root script uses --if-present, so a
    // member with no script is silently skipped rather than failing: e2e/ was
    // typechecked by nothing (Finding 16).
    // Derived from the workspace, not hand-listed: a hard-coded list lets the
    // guarantee lapse silently the day a fifth member is added.
    const patterns = read("pnpm-workspace.yaml")
      .split("\n")
      .filter((l) => /^\s*-\s/.test(l))
      .map((l) => l.replace(/^\s*-\s*/, "").replace(/["']/g, "").trim());
    const members = patterns.flatMap((pat) =>
      pat.endsWith("/*")
        ? readdirSync(join(root, pat.slice(0, -2))).map((d) => `${pat.slice(0, -2)}/${d}`)
        : [pat],
    ).filter((m) => existsSync(join(root, m, "package.json")));
    expect(members.length, "the workspace has members to check").toBeGreaterThan(3);
    for (const m of members) {
      const pkg = JSON.parse(read(`${m}/package.json`));
      expect(pkg.scripts?.typecheck, `${m} typecheck`).toBeTruthy();
      expect(pkg.scripts.typecheck, `${m} runs tsc --noEmit`).toMatch(/tsc\s+--noEmit/);
    }
  });

  it("the lockfile is committed", () => {
    expect(existsSync(join(root, "pnpm-lock.yaml"))).toBe(true);
  });
});
