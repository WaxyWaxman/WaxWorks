import { describe, expect, it } from "vitest";
import { regradeCostRefusal, regradeShortfall, routeStockRefusal, statusAfterRoute } from "./returnRouting";
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

describe("A-82 / E-06 decision 19 — a re-graded copy is capped at the sold copy's cost", () => {
  it("permits assessing below what the sold copy carried", () => {
    // The direction that is sound and is the point: a disc that comes back
    // ruined really is worth less than the store paid, and the shortfall has
    // somewhere honest to go — E-04's `Damaged`, where M-07 d6 already sends
    // condition losses.
    expect(regradeCostRefusal(2.0, 8.0)).toBeUndefined();
    expect(regradeCostRefusal(0, 8.0)).toBeUndefined();
  });

  it("permits assessing at exactly the cap, which is the ordinary case", () => {
    // Most discs come back fine and carry the cost unchanged.
    expect(regradeCostRefusal(8.0, 8.0)).toBeUndefined();
  });

  it("refuses assessing above it, which is what decision 16 tried", () => {
    // d16 gave the copy the REFUND paid. A refund is normally near the sale
    // price, which is above cost, so it wrote Inventory up on almost every
    // return — and the only credit M-07 d2 supplies is the copy's own cost, so
    // the excess had no home but income the store did not earn. On E-06's
    // worked example, profit and Inventory were each overstated by $23.49.
    const why = regradeCostRefusal(31.49, 8.0);

    expect(why).toBeDefined();
    expect(why).toMatch(/8\.00/);
    expect(why).toMatch(/income the store did not earn/);
  });

  it("refuses a negative cost", () => {
    expect(regradeCostRefusal(-1, 8.0)).toBeDefined();
  });
});

describe("A-82 — the shortfall a re-grade posts to Damaged", () => {
  it("strands the difference when the copy is assessed below the cap", () => {
    // Walked in the prototype: a Rumours copy carrying $18.75, assessed at
    // $5.00 after coming back marked. M-07 d6's `Damaged` account takes the
    // rest, as a period cost rather than something pushed onto a copy.
    expect(regradeShortfall(5.0, 18.75)).toBe(13.75);
  });

  it("strands nothing when assessed at the cap, which is the ordinary case", () => {
    // Most discs come back fine, carry the cost unchanged, and write no
    // journal at all.
    expect(regradeShortfall(18.75, 18.75)).toBe(0);
  });

  it("never returns a negative shortfall", () => {
    // Above the cap is refused by regradeCostRefusal; if it ever reached here
    // it must not post a backwards journal.
    expect(regradeShortfall(31.49, 18.75)).toBe(0);
  });

  it("uses E-06's worked example", () => {
    // Received $8.00, assessed at $2.00 after coming back badly marked.
    expect(regradeShortfall(2.0, 8.0)).toBe(6.0);
  });
});
