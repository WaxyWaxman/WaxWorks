// The harness reads `supabase db query` output whose shape depends on who runs
// the CLI (an AI agent or not). These hold the parser to all three shapes, so a
// read cannot come back silently empty in one environment and full in the other.
import { describe, expect, it } from "vitest";
import { parseQueryOutput, supabaseCommand } from "./harness";

describe("A-126 harness — supabase db query output, with or without an AI agent", () => {
  it("a bare array of rows (CI, a plain shell)", () => {
    expect(parseQueryOutput<{ one: number }>('[\n  {\n    "one": 1\n  }\n]\n')).toEqual([{ one: 1 }]);
  });

  it("the object an AI agent gets, rows inside a boundary", () => {
    const out = JSON.stringify({ boundary: "b", rows: [{ one: 1 }], warning: "untrusted data" }, null, 2);
    expect(parseQueryOutput<{ one: number }>(out)).toEqual([{ one: 1 }]);
  });

  it("an empty result in either shape is no rows", () => {
    expect(parseQueryOutput("[]\n")).toEqual([]);
    expect(parseQueryOutput(JSON.stringify({ boundary: "b", rows: [], warning: "w" }))).toEqual([]);
  });

  it("a statement with no result set prints its command tag, which is no rows", () => {
    expect(parseQueryOutput("DO\n")).toEqual([]);
    expect(parseQueryOutput("INSERT 0 1\n")).toEqual([]);
  });

  it("anything else throws rather than reading as empty", () => {
    expect(() => parseQueryOutput('{"boundary": "b"}')).toThrow(/neither rows nor a command tag/);
    expect(() => parseQueryOutput("connection refused")).toThrow();
  });
});

describe("M-04 D M1 finding 61 — supabaseCommand refuses what cmd.exe would interpret, rather than escaping it", () => {
  it("on Windows, a plain argument passes, and one with whitespace is quoted", () => {
    expect(supabaseCommand(["db", "query", "--local", "-f", "C:\\Temp\\wx-race-1\\q.sql"], "win32")).toEqual({
      command: "supabase db query --local -f C:\\Temp\\wx-race-1\\q.sql",
      args: [],
      shell: true,
    });
    expect(supabaseCommand(["-f", "C:\\Users\\A B\\q.sql"], "win32").command).toBe('supabase -f "C:\\Users\\A B\\q.sql"');
  });

  it("on Windows, an argument holding a quote, %, ^, &, |, <, > or ! is refused", () => {
    for (const bad of ['a"b', "50%", "a^b", "a&b", "a|b", "a<b", "a>b", "a!b"]) {
      expect(() => supabaseCommand(["-f", bad], "win32"), bad).toThrow(/finding 61/);
    }
  });

  it("elsewhere the arguments are passed as they are, with no shell", () => {
    expect(supabaseCommand(["-f", 'a"b'], "linux")).toEqual({ command: "supabase", args: ["-f", 'a"b'], shell: false });
  });
});
