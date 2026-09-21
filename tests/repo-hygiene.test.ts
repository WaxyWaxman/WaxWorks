import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("A-31 — the agent configuration is version-controlled", () => {
  it.each(["node_modules", ".next", "supabase/.branches", ".vercel", "test-results", "playwright-report"])(
    ".gitignore covers %s",
    (name) => {
      const lines = read(".gitignore").split("\n").map((l) => l.trim());
      expect(lines.some((l) => l === name || l === `${name}/` || l === `/${name}` || l === `**/${name}`), name).toBe(true);
    },
  );

  // Row 16 named `.env*.local`; a root .env, .env.development or e2e/.env was
  // still committable (Finding 9). The question is what git actually ignores,
  // so ask git rather than the file's text.
  const ignored = (path: string) => {
    try {
      execSync(`git check-ignore -q "${path}"`, { cwd: root });
      return true;
    } catch {
      return false;
    }
  };

  it.each([".env", ".env.local", ".env.development", ".env.production.local", "e2e/.env", "apps/web/.env"])(
    "A-100 — git ignores %s: secrets live in the platform, never in a file",
    (path) => {
      expect(ignored(path), path).toBe(true);
    },
  );

  it("the committed .env.example is the one exception, so the variable NAMES stay reviewable", () => {
    expect(ignored(".env.example")).toBe(false);
    expect(readFileSync(join(root, ".env.example"), "utf8").length).toBeGreaterThan(0);
  });

  it(".gitignore still tracks the shared agent configuration", () => {
    const gi = read(".gitignore");
    for (const keep of ["!.claude/launch.json", "!.claude/settings.json", "!.claude/skills/", "!.claude/agents/"]) {
      expect(gi).toContain(keep);
    }
  });

  it("launch.json has an apps/web dev-server entry beside the prototype's", () => {
    const launch = JSON.parse(read(".claude/launch.json"));
    const names = launch.configurations.map((c: { name: string }) => c.name);
    expect(names).toContain("prototype");
    expect(names).toContain("web");
    const web = launch.configurations.find((c: { name: string }) => c.name === "web");
    expect(web.port).toBe(3000);
    expect(web.runtimeExecutable).toBe("pnpm");
  });
});
