import { describe, expect, it } from "vitest";
import { roundToEnding } from "./money";

// A-49 / M-06 d44 — E-02 d55, E-04 d31. One configured ending, nearest, ties
// away from zero. The old helper (E-02 d9) had two endings and always went up.
describe("A-49 — round to the nearest configured price ending", () => {
  it("goes down as readily as up", () => {
    expect(roundToEnding(23.0, 99)).toBe(22.99);
    expect(roundToEnding(23.47, 99)).toBe(22.99);
    expect(roundToEnding(23.5, 99)).toBe(23.99);
    expect(roundToEnding(23.51, 99)).toBe(23.99);
    expect(roundToEnding(23.99, 99)).toBe(23.99);
  });

  it("gives E-02's worked example its 44.99", () => {
    expect(roundToEnding(27.99 * 1.6, 99)).toBe(44.99);
  });

  it("takes any ending M-06 can hold, .00 included", () => {
    expect(roundToEnding(23.47, 95)).toBe(23.95);
    expect(roundToEnding(23.44, 95)).toBe(22.95);
    expect(roundToEnding(23.47, 0)).toBe(23.0);
    expect(roundToEnding(23.51, 0)).toBe(24.0);
  });

  it("breaks a tie away from zero, as A-47 does", () => {
    expect(roundToEnding(23.5, 0)).toBe(24.0);
    expect(roundToEnding(23.49, 99)).toBe(23.99);
  });

  it("suggests nothing for a non-positive figure", () => {
    expect(roundToEnding(0, 99)).toBe(0);
    expect(roundToEnding(-5, 99)).toBe(0);
  });
});
