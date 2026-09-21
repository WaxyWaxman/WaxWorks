import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");

/** config.toml by section — no TOML parser is a dependency here, and the two questions are flat. */
function sections(toml: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current = "";
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = header[1]!;
      out[current] ??= [];
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    (out[current] ??= []).push(line);
  }
  return out;
}

const bySection = sections(config);
const setting = (section: string, key: string) =>
  bySection[section]?.find((l) => l.startsWith(`${key} `) || l.startsWith(`${key}=`));

describe("A-105 — functions live in app, tables in public; app is exposed to PostgREST for rpc", () => {
  it("[api].schemas exposes app, so M1's first wrapper call does not answer PGRST202", () => {
    const schemas = setting("api", "schemas");
    expect(schemas, "[api].schemas").toBeTruthy();
    expect(schemas).toMatch(/"app"/);
  });

  it("public stays exposed — §5's two policy shapes are written for it", () => {
    expect(setting("api", "schemas")).toMatch(/"public"/);
  });
});

describe("A-91 (amended 2026-09-21) — public sign-up is off in every environment", () => {
  it("no section of config.toml leaves a sign-up path open", () => {
    // A-91's four Auth-identity paths are the whole set; a fifth built into every
    // Supabase branch from this file is the finding. Invites via the admin API
    // still work with sign-up off.
    const open = Object.entries(bySection)
      .flatMap(([name, lines]) => lines.filter((l) => /^enable_signup\s*=\s*true/.test(l)).map(() => name));
    expect(open, "sections with enable_signup = true").toEqual([]);
  });

  it("the two sign-up switches are stated false rather than left to a default", () => {
    expect(setting("auth", "enable_signup"), "[auth].enable_signup").toMatch(/=\s*false/);
    expect(setting("auth.email", "enable_signup"), "[auth.email].enable_signup").toMatch(/=\s*false/);
  });

  it("anonymous sign-in stays off beside it (A-91)", () => {
    expect(setting("auth", "enable_anonymous_sign_ins")).toMatch(/=\s*false/);
  });
});
