import { describe, expect, it } from "vitest";
import { routeStockRefusal, statusAfterRoute } from "./returnRouting";
import { isPresent } from "./totals";
import type { InventoryItem } from "../data/types";

const copy = (status: InventoryItem["status"]): InventoryItem =>
  ({ id: "i-1", recordId: "r-1", grade: "VG+", price: 20, cost: 8, status }) as InventoryItem;

describe("A-81 / A-28a — the write-off route is manager-only", () => {
  it("refuses a write-off with no authorizing Manager", () => {
    // The shrinkage path. Ungated it is a copy taken in over the counter, cash
    // refunded, and the copy removed from stock with no Manager in the act.
    const why = routeStockRefusal("writeoff", undefined);

    expect(why).toBeDefined();
    expect(why).toMatch(/Manager/);
  });

  it("refuses a write-off authorized by nobody in particular", () => {
    // Blank is not an authorizer. The prototype's old gate accepted any two
    // characters typed into it, so manager-only was satisfied by initials
    // belonging to nobody — the same failure ManagerAuthorize was renamed to fix.
    expect(routeStockRefusal("writeoff", "")).toBeDefined();
    expect(routeStockRefusal("writeoff", "   ")).toBeDefined();
  });

  it("permits a write-off a Manager authorized", () => {
    expect(routeStockRefusal("writeoff", "Dana Reyes (Manager)")).toBeUndefined();
  });

  it("leaves the other two dispositions ungated, with or without a Manager", () => {
    // E-06 decision 3's permissive Return is not being narrowed. A-81 reaches
    // the disposition that REMOVES a copy, not the assessment — and E-06
    // decision 7 is what holds refund and disposition apart so it can.
    expect(routeStockRefusal("sellable", undefined)).toBeUndefined();
    expect(routeStockRefusal("regrade", undefined)).toBeUndefined();
    expect(routeStockRefusal("sellable", "Dana Reyes (Manager)")).toBeUndefined();
  });
});

describe("A-81 — a written-off copy is not a sold one", () => {
  it("gives a write-off its own status rather than storing it as sold", () => {
    // Stored as `sold` a written-off copy was indistinguishable from one
    // somebody bought, in every derivation including margin, and it leaves no
    // Sale line behind it the way a real sale does. The shrinkage figure and
    // the margin figure were wrong by the same amount with nothing saying so.
    expect(statusAfterRoute("writeoff")).toBe("written_off");
    expect(statusAfterRoute("writeoff")).not.toBe("sold");
  });

  it("returns the other two routes to the shelf", () => {
    expect(statusAfterRoute("sellable")).toBe("sellable");
    expect(statusAfterRoute("regrade")).toBe("sellable");
  });

  it("does not count a written-off copy as present", () => {
    // Architecture §5.1's warning, as a test: "a query that enumerates
    // statuses from memory rather than reading this block will count a
    // written-off copy as present". Three screens asked `status !== "sold"`
    // and would each have done exactly that.
    expect(isPresent(copy("written_off"))).toBe(false);
    expect(isPresent(copy("sold"))).toBe(false);
    expect(isPresent(copy("sellable"))).toBe(true);
    expect(isPresent(copy("held"))).toBe(true);
  });
});
