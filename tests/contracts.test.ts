import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNCTIONS } from "../packages/contracts/src/functions";
import * as contracts from "../packages/contracts/src/index";
import { createFakeClient } from "../packages/contracts/src/fake";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("A-99 — the M0 contracts skeleton is every §6 function's name, argument list and return shape, with a stub wrapper that throws not_implemented", () => {
  it("the committed list is non-trivial and every name is unique", () => {
    expect(FUNCTIONS.length).toBeGreaterThan(80);
    expect(new Set(FUNCTIONS.map((f) => f.name)).size).toBe(FUNCTIONS.length);
  });

  it.each(FUNCTIONS.map((f) => [f.name, f] as const))("%s has one file under its §6 domain and is exported", (name, f) => {
    expect(existsSync(join(root, "packages/contracts/src", f.domain, `${name}.ts`)), `${f.domain}/${name}.ts`).toBe(true);
    expect(typeof (contracts as Record<string, unknown>)[name], `export ${name}`).toBe("function");
  });

  it.each(FUNCTIONS.map((f) => [f.name, f] as const))("%s throws not_implemented through the fake client", async (name) => {
    const wrapper = (contracts as Record<string, (c: unknown, i: unknown) => Promise<unknown>>)[name]!;
    await expect(wrapper(createFakeClient(), {})).rejects.toMatchObject({ code: "not_implemented", fn: name });
  });

  it.each(FUNCTIONS.filter((f) => f.kind !== "pure").map((f) => [f.name, f] as const))(
    "%s's input carries the A-103 header arguments",
    (name, f) => {
      const schema = (contracts as Record<string, unknown>)[`${pascal(name)}Input`] as { shape: Record<string, unknown> };
      expect(schema?.shape, `${pascal(name)}Input`).toBeTruthy();
      for (const k of ["p_actor_user_id", "p_actor_initials", "p_request_id", "p_terminal_id"]) {
        expect(k in schema.shape, `${name}.${k}`).toBe(true);
      }
      expect("p_manager_pin" in schema.shape, `${name}.p_manager_pin`).toBe(f.kind === "M" || f.kind === "O");
    },
  );

  it("pure helpers take their §6 arguments and no actor", () => {
    const shape = (n: string) => Object.keys((contracts as Record<string, { shape: Record<string, unknown> }>)[`${pascal(n)}Input`]!.shape);
    expect(shape("round_to_ending")).toEqual(["minor", "ending_minor"]);
    expect(shape("suggested_retail")).toEqual(["list_minor", "margin_ppm"]);
    expect(shape("tax_rate_at")).toEqual(["rate_ppm", "pending_rate_ppm", "pending_from", "at"]);
    expect(shape("upc_a_check_digit")).toEqual(["digits"]);
    expect(shape("invoice_is_paid")).toEqual(["invoice_id"]);
    expect(shape("period_is_sealed")).toEqual(["p_business_date"]);
  });
});

describe("A-98 — a contract is one file per function: Zod schemas and one wrapper shape; the fake is chosen by construction, never by an environment variable", () => {
  it("zod is the one schema dependency", () => {
    const pkg = JSON.parse(read("packages/contracts/package.json"));
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps).toContain("zod");
    expect(deps.filter((d) => /valibot|yup|superstruct|arktype|typebox|io-ts|ajv/.test(d))).toEqual([]);
  });

  it("no file under packages/contracts/src reads process.env or branches on a flag", () => {
    const files = execSync('git ls-files -z -- "packages/contracts/src"', { cwd: root }).toString().split("\0").filter(Boolean);
    const untracked = execSync('git ls-files -z --others --exclude-standard -- "packages/contracts/src"', { cwd: root }).toString().split("\0").filter(Boolean);
    const offenders = [...files, ...untracked].filter((f) => /process\.env|import\.meta\.env|USE_FAKE|FAKE_CLIENT/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the fake is a separate entry point, so importing it shows in a diff", () => {
    const pkg = JSON.parse(read("packages/contracts/package.json"));
    expect(pkg.exports["./fake"]).toBeTruthy();
    expect(pkg.exports["."]).toBeTruthy();
    // Statements only — the file's comment says the fake is absent, which is the point.
    const code = read("packages/contracts/src/index.ts").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/fake/);
  });

  it("every wrapper has the one signature: (client, input) => Promise<output>", () => {
    for (const f of FUNCTIONS) {
      const w = (contracts as Record<string, (...a: unknown[]) => unknown>)[f.name]!;
      expect(w.length, `${f.name} arity`).toBe(2);
    }
  });
});

function pascal(s: string) {
  return s.replace(/(^|_)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
}
