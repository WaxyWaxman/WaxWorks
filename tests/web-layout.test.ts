import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const app = join(root, "apps", "web", "app");

describe("A-2 — Next.js App Router on Vercel; till screens are client components, back-office server-rendered", () => {
  const groups = ["(till)", "(back)", "print", "api/cron", "(auth)", "(org)", "(admin)"];

  it.each(groups)("architecture §7 route group %s exists under apps/web/app", (g) => {
    const dir = join(app, g);
    expect(existsSync(dir), dir).toBe(true);
    expect(statSync(dir).isDirectory()).toBe(true);
  });

  it("apps/web is a Next.js App Router application", () => {
    const pkg = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8"));
    expect(pkg.dependencies.next).toBeTruthy();
    expect(existsSync(join(app, "layout.tsx"))).toBe(true);
    // No pages/ router: the App Router is the only one (A-2).
    expect(existsSync(join(root, "apps/web/pages"))).toBe(false);
  });

  it("the till group is marked client and the back-office group is not", () => {
    // Each group carries a layout that fixes its rendering mode for every screen
    // it will hold. The till's says "use client"; the back-office's must not.
    const till = readFileSync(join(app, "(till)", "layout.tsx"), "utf8");
    const back = readFileSync(join(app, "(back)", "layout.tsx"), "utf8");
    expect(till).toMatch(/^\s*["']use client["'];?/m);
    expect(back).not.toMatch(/["']use client["']/);
  });

  it("no route group holds a screen yet — placeholders only", () => {
    for (const g of groups) {
      const files = readdirSync(join(app, g)).filter((f) => f.endsWith(".tsx"));
      for (const f of files) {
        const src = readFileSync(join(app, g, f), "utf8");
        expect(src.length, `${g}/${f}`).toBeLessThan(1200);
      }
    }
  });
});
