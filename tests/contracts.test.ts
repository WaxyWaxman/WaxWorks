import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNCTIONS } from "../packages/contracts/src/functions";
import * as contracts from "../packages/contracts/src/index";
import { createFakeClient } from "../packages/contracts/src/fake";
import { createSupabaseWaxClient } from "../packages/contracts/src/supabase";
import { contract, header, isCorrelated, managerHeader } from "../packages/contracts/src/wrapper";
import type { WaxClient } from "../packages/contracts/src/client";

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
    const wrapper = (contracts as unknown as Record<string, (c: unknown, i: unknown) => Promise<unknown>>)[name]!;
    await expect(wrapper(createFakeClient(), {})).rejects.toMatchObject({ code: "not_implemented", fn: name });
  });

  it.each(FUNCTIONS.filter((f) => f.kind !== "pure").map((f) => [f.name, f] as const))(
    "%s's input carries the A-103 header arguments",
    (name, f) => {
      const schema = (contracts as Record<string, unknown>)[`${pascal(name)}Input`] as { shape: Record<string, unknown> };
      expect(schema?.shape, `${pascal(name)}Input`).toBeTruthy();
      for (const k of ["p_actor_user_id", "p_actor_initials", "p_terminal_id"]) {
        expect(k in schema.shape, `${name}.${k}`).toBe(true);
      }
      // A-94: the wrapper mints p_request_id, so it is never a caller's input.
      expect("p_request_id" in schema.shape, `${name}.p_request_id`).toBe(false);
      expect("p_manager_pin" in schema.shape, `${name}.p_manager_pin`).toBe(f.kind === "M" || f.kind === "O");
    },
  );

  it("resolve_scan carries §6's p_code beside the header", () => {
    expect("p_code" in contracts.ResolveScanInput.shape, "resolve_scan.p_code").toBe(true);
  });

  it("the six §6-stated return shapes are stated, not z.unknown()", () => {
    // §6 lines 461–468: bigint, minor, ppm, text, boolean, boolean. The minor
    // and bigint shapes follow the input side's z.bigint(); how a bigint minor
    // unit crosses the wire is Finding 10's open question, unchanged here.
    expect(contracts.RoundToEndingOutput.safeParse(101n).success, "round_to_ending → bigint").toBe(true);
    expect(contracts.RoundToEndingOutput.safeParse(101).success, "round_to_ending rejects a JS number").toBe(false);
    expect(contracts.SuggestedRetailOutput.safeParse(1299n).success, "suggested_retail → minor").toBe(true);
    expect(contracts.SuggestedRetailOutput.safeParse(12.99).success, "suggested_retail rejects a float").toBe(false);
    expect(contracts.TaxRateAtOutput.safeParse(50000).success, "tax_rate_at → ppm").toBe(true);
    expect(contracts.TaxRateAtOutput.safeParse(0.05).success, "tax_rate_at rejects a float").toBe(false);
    expect(contracts.UpcACheckDigitOutput.safeParse("7").success, "upc_a_check_digit → text").toBe(true);
    expect(contracts.UpcACheckDigitOutput.safeParse(7).success, "upc_a_check_digit rejects a number").toBe(false);
    expect(contracts.InvoiceIsPaidOutput.safeParse(false).success, "invoice_is_paid → boolean").toBe(true);
    expect(contracts.InvoiceIsPaidOutput.safeParse("false").success, "invoice_is_paid rejects a string").toBe(false);
    expect(contracts.PeriodIsSealedOutput.safeParse(false).success, "period_is_sealed → boolean").toBe(true);
    expect(contracts.PeriodIsSealedOutput.safeParse("false").success, "period_is_sealed rejects a string").toBe(false);
  });

  it("every file under a §6 domain is a function the committed list names", () => {
    // Row 7's stated failure runs both ways: a file the list does not name is a
    // contract nobody approved (Finding 21).
    const listed = new Set(FUNCTIONS.map((f) => `${f.domain}/${f.name}.ts`));
    const infra = new Set(["client.ts", "wrapper.ts", "functions.ts", "index.ts", "supabase.ts"]);
    // Tracked AND untracked, as the A-98 test below does: an uncommitted contract
    // file is exactly the case this guard exists to catch, and it is the case a
    // developer hits first.
    const ls = (args: string) =>
      execSync(`git ls-files -z ${args} -- "packages/contracts/src"`, { cwd: root }).toString().split("\0").filter(Boolean);
    const files = [...ls(""), ...ls("--others --exclude-standard")]
      .map((f) => f.replace("packages/contracts/src/", ""))
      .filter((f) => !infra.has(f) && !f.startsWith("fake/"));
    expect(files.filter((f) => !listed.has(f)), "files no §6 entry names").toEqual([]);
  });

  it("pure helpers take their §6 arguments and no actor", () => {
    const shape = (n: string) => Object.keys((contracts as unknown as Record<string, { shape: Record<string, unknown> }>)[`${pascal(n)}Input`]!.shape);
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
      const w = (contracts as unknown as Record<string, (...a: unknown[]) => unknown>)[f.name]!;
      expect(w.length, `${f.name} arity`).toBe(2);
    }
  });
});

function pascal(s: string) {
  return s.replace(/(^|_)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
}

describe("A-94 — p_request_id is minted by the wrapper; it correlates and never authorises", () => {
  const seen: Record<string, unknown>[] = [];
  const recorder: WaxClient = {
    async rpc(_fn, args) {
      seen.push(args);
      return true;
    },
  };

  it("the shared header does not ask the caller for one", () => {
    expect("p_request_id" in header.shape).toBe(false);
    expect("p_request_id" in managerHeader.shape).toBe(false);
  });

  it("a contract call carries a freshly minted uuid the caller never supplied", async () => {
    seen.length = 0;
    const call = contract("probe", header, contracts.InvoiceIsPaidOutput);
    const input = {
      p_actor_user_id: "00000000-0000-4000-8000-000000000001",
      p_actor_initials: "YY",
      p_terminal_id: null,
    };
    await call(recorder, input);
    await call(recorder, input);
    expect(seen).toHaveLength(2);
    for (const args of seen) {
      expect(String(args.p_request_id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(seen[0]!.p_request_id, "a second call is a second request").not.toBe(seen[1]!.p_request_id);
  });

  it("a caller that supplies one does not get to choose it", async () => {
    seen.length = 0;
    const call = contract("probe", header, contracts.InvoiceIsPaidOutput);
    const planted = "11111111-1111-4111-8111-111111111111";
    await call(recorder, {
      p_actor_user_id: "00000000-0000-4000-8000-000000000001",
      p_actor_initials: "YY",
      p_terminal_id: null,
      p_request_id: planted,
    } as never);
    expect(seen[0]!.p_request_id).not.toBe(planted);
  });

  it("every non-pure §6 function is correlated and every pure helper is not", () => {
    // The mapping itself, not a synthetic probe: this is what breaks silently if
    // the M1 contract pull request changes an S function's argument list.
    for (const f of FUNCTIONS) {
      expect(isCorrelated(f.name), `${f.name} (${f.kind || "any actor"})`).toBe(f.kind !== "pure");
    }
    expect(FUNCTIONS.filter((f) => f.kind === "pure").length, "pure helpers exist to make this meaningful").toBeGreaterThan(0);
  });

  it("a name the committed list does not know mints one — a stray argument fails loudly", () => {
    expect(isCorrelated("not_a_function")).toBe(true);
  });

  it("a pure helper is not given one — it has no header to carry it (§6)", async () => {
    seen.length = 0;
    const call = contract("upc_a_check_digit", contracts.UpcACheckDigitInput, contracts.UpcACheckDigitOutput);
    await call({ async rpc(_fn, args) { seen.push(args); return "7"; } }, { digits: "03600029145" });
    expect("p_request_id" in seen[0]!).toBe(false);
  });
});

describe("A-105 — the real client calls supabase.schema(\"app\").rpc, because every function is app.<name>", () => {
  it("rpc resolves in app and never on the default schema", async () => {
    const schemas: string[] = [];
    const supabase = {
      schema(name: string) {
        schemas.push(name);
        return { async rpc(fn: string, args: unknown) { return { data: { fn, args }, error: null }; } };
      },
      async rpc() {
        throw new Error("rpc was called on the default schema — under A-105 that answers PGRST202");
      },
    };
    const client = createSupabaseWaxClient(supabase as never);
    await expect(client.rpc("probe", { a: 1 })).resolves.toEqual({ fn: "probe", args: { a: 1 } });
    expect(schemas).toEqual(["app"]);
  });

  it("a PostgREST error still surfaces as a typed ContractError", async () => {
    const supabase = {
      schema: () => ({ async rpc() { return { data: null, error: { code: "PGRST202", message: "not found" } }; } }),
    };
    const client = createSupabaseWaxClient(supabase as never);
    await expect(client.rpc("probe", {})).rejects.toMatchObject({ fn: "probe", code: "PGRST202" });
  });
});
