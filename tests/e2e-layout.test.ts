import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("A-85 — the end-to-end suite is a top-level e2e/ directory, outside both apps", () => {
  it("e2e/ is its own package and a workspace member, with @playwright/test", () => {
    const pkg = JSON.parse(read("e2e/package.json"));
    expect(pkg.name).toBe("@waxworks/e2e");
    expect(pkg.devDependencies["@playwright/test"]).toBeTruthy();
    expect(read("pnpm-workspace.yaml")).toMatch(/^\s*-\s*e2e\s*$/m);
  });

  it("its config drives PLAYWRIGHT_BASE_URL and matches one spec per register row under a flow directory", () => {
    const cfg = read("e2e/playwright.config.ts");
    expect(cfg).toMatch(/process\.env\.PLAYWRIGHT_BASE_URL/);
    expect(cfg).toMatch(/testMatch:\s*\/\[EMOS\]-/); // one spec per register row, under a flow directory
    expect(existsSync(join(root, "e2e/fixtures"))).toBe(true);
  });

  it("it lives outside both apps and no spec exists at M0 — specs are QA's (/qa automate)", () => {
    expect(existsSync(join(root, "apps/web/e2e"))).toBe(false);
    expect(existsSync(join(root, "apps/web/playwright.config.ts"))).toBe(false);
    const specs = execSync("git ls-files -z --cached --others --exclude-standard -- e2e", { cwd: root })
      .toString()
      .split("\0")
      .filter((f) => /\.spec\.ts$/.test(f));
    expect(specs).toEqual([]);
  });

  it("the root test script excludes e2e — Playwright is not one of A-97's six CI jobs", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.test).toMatch(/--filter\s+!@waxworks\/e2e/);
    // Statements only — a comment says Playwright is absent, which is the point.
    const ci = read(".github/workflows/build-check.yml")
      .split("\n")
      .filter((x) => !x.trim().startsWith("#"))
      .join("\n");
    expect(ci).not.toMatch(/playwright/i);
  });
});
