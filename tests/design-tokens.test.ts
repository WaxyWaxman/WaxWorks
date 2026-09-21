import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenMap } from "../apps/web/design/tokens";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// The prototype's stylesheet is the token source (architecture §7: harvested).
const prototypeTokens = [...read("prototype/src/styles/tokens.css").matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!);

describe("A-9 — Tailwind + shadcn/ui; the prototype's design tokens map onto Tailwind theme variables", () => {
  it("the prototype defines tokens to harvest", () => {
    expect(prototypeTokens.length).toBeGreaterThan(40);
  });

  it("every prototype token has a mapping to a Tailwind theme variable", () => {
    const unmapped = prototypeTokens.filter((t) => !(t in tokenMap));
    expect(unmapped).toEqual([]);
  });

  it("every mapped Tailwind variable is defined inside @theme in the app's theme stylesheet", () => {
    const css = read("apps/web/app/theme.css");
    const theme = css.match(/@theme\s*(?:inline\s*)?\{([\s\S]*?)\n\}/);
    expect(theme, "an @theme block").toBeTruthy();
    const defined = new Set([...theme![1]!.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!));
    const missing = Object.values(tokenMap).filter((v) => !defined.has(v));
    expect(missing).toEqual([]);
  });

  it("mapped values equal the prototype's values — harvested, not redesigned", () => {
    const proto = Object.fromEntries(
      [...read("prototype/src/styles/tokens.css").matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1]!, m[2]!.trim()]),
    );
    const theme = read("apps/web/app/theme.css");
    const app = Object.fromEntries([...theme.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1]!, m[2]!.trim()]));
    for (const [from, to] of Object.entries(tokenMap)) {
      expect(app[to], `${from} → ${to}`).toBe(proto[from]);
    }
  });

  it("Tailwind and shadcn/ui are installed in apps/web", () => {
    const pkg = JSON.parse(read("apps/web/package.json"));
    expect(pkg.devDependencies.tailwindcss ?? pkg.dependencies.tailwindcss).toBeTruthy();
    expect(existsSync(join(root, "apps/web/components.json")), "shadcn components.json").toBe(true);
    expect(read("apps/web/app/globals.css")).toMatch(/@import\s+["']\.\/theme\.css["']/);
  });
});
