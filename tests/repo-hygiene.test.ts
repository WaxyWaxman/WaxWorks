import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("A-31 — the agent configuration is version-controlled", () => {
  it.each(["node_modules", ".next", "supabase/.branches", ".vercel", ".env*.local", "test-results", "playwright-report"])(
    ".gitignore covers %s",
    (name) => {
      const lines = read(".gitignore").split("\n").map((l) => l.trim());
      expect(lines.some((l) => l === name || l === `${name}/` || l === `/${name}` || l === `**/${name}`), name).toBe(true);
    },
  );

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
