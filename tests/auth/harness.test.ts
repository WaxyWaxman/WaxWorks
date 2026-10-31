// The harness reads `supabase db query` output whose shape depends on who runs
// the CLI (an AI agent or not). These hold the parser to all three shapes, so a
// read cannot come back silently empty in one environment and full in the other.
import { describe, expect, it } from "vitest";
import { parseQueryOutput } from "./harness";

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
