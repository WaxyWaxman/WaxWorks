import { describe, expect, it } from "vitest";
import { mintSecondHandRef } from "./secondHandRef";

describe("E-02 d39 / A-152 — a second-hand reference carries its Store's position", () => {
  it("A-152 — Store 1's first intake on 2026-11-14 is SH1-261114-1", () => {
    expect(mintSecondHandRef(1, "2026-11-14", [])).toBe("SH1-261114-1");
  });

  it("A-152 — a second intake the same day at the same Store is -2", () => {
    expect(mintSecondHandRef(1, "2026-11-14", ["SH1-261114-1"])).toBe("SH1-261114-2");
  });

  it("A-152 — Store 2 counts its own day from -1, whatever Store 1 minted", () => {
    expect(mintSecondHandRef(2, "2026-11-14", ["SH1-261114-1", "SH1-261114-2"])).toBe("SH2-261114-1");
  });

  it("A-152 — the position is unpadded, and SH1- does not count SH12-'s references", () => {
    expect(mintSecondHandRef(12, "2026-11-14", ["SH1-261114-1"])).toBe("SH12-261114-1");
    expect(mintSecondHandRef(1, "2026-11-14", ["SH12-261114-1"])).toBe("SH1-261114-1");
  });

  it("E-02 d39 — another day starts again at -1; a supplier's own number is not counted", () => {
    expect(mintSecondHandRef(1, "2026-11-15", ["SH1-261114-1", "INV-9931"])).toBe("SH1-261115-1");
  });
});
