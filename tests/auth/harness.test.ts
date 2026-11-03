// The harness reads `supabase db query` output whose shape depends on who runs
// the CLI (an AI agent or not). These hold the parser to all three shapes, so a
// read cannot come back silently empty in one environment and full in the other.
import { describe, expect, it } from "vitest";
import { isCliCrash, parseQueryOutput, supabaseCommand } from "./harness";

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

describe("M-04 D M1 finding 71 — supabaseCommand also refuses a line break and a trailing backslash on Windows (S-01 D M1 row 26)", () => {
  it("on Windows, an argument holding a CR or LF is refused: cmd.exe ends the command at a line break, even inside quotes", () => {
    for (const bad of ["a\rb", "a\nb", "a\r\nb"]) {
      expect(() => supabaseCommand(["-f", bad], "win32"), JSON.stringify(bad)).toThrow(/finding 71/);
    }
  });

  it("on Windows, an argument ending in a backslash is refused: quoted, it would read as an escaped quote", () => {
    expect(() => supabaseCommand(["-f", "C:\\Temp\\"], "win32")).toThrow(/finding 71/);
    expect(() => supabaseCommand(["-f", "C:\\A B\\"], "win32")).toThrow(/finding 71/);
  });

  it("elsewhere neither is refused: no shell reads them", () => {
    expect(supabaseCommand(["-f", "a\nb\\"], "linux")).toEqual({ command: "supabase", args: ["-f", "a\nb\\"], shell: false });
  });
});

describe("M-04 D M1 finding 63 — a Windows CLI crash before the query runs is retried; a query's own failure is not (S-01 D M1 row 26)", () => {
  // The crash findings 39 and 63 quote: the Bun-wrapped supabase.exe 2.117.0
  // ending with a PlatformError before it connects.
  const crash = "failed:  error: PlatformError\n    at supabase.exe (B:/~BUN/root/supabase.exe:12:3)";

  it("on Windows, the wrapper's PlatformError is a crash", () => {
    expect(isCliCrash(crash, "win32")).toBe(true);
  });

  it("a SQL error is the query's own failure, never retried, whatever its text", () => {
    expect(isCliCrash('ERROR: relation "public.nope" does not exist (SQLSTATE 42P01)', "win32")).toBe(false);
    expect(isCliCrash("ERROR: PlatformError (SQLSTATE P0001)", "win32")).toBe(false);
  });

  it("off Windows nothing is retried: the crash has not been seen there (CI is Linux)", () => {
    expect(isCliCrash(crash, "linux")).toBe(false);
  });
});
