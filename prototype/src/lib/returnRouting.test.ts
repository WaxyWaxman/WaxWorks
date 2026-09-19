import { describe, expect, it } from "vitest";
import {
  finishReturnRefusal,
  regradeCostRefusal,
  regradeShortfall,
  routeDocumentRefusal,
  routeStockRefusal,
  statusAfterRoute,
  unrouteRefusal,
} from "./returnRouting";
import { isPresent } from "./totals";
import type { InventoryItem } from "../data/types";

const copy = (status: InventoryItem["status"]): InventoryItem =>
  ({ id: "i-1", recordId: "r-1", grade: "VG+", price: 20, cost: 8, status }) as InventoryItem;

const manager = { role: "Manager" as const, active: true, name: "Y. Nakamura" };
const employee = { role: "Employee" as const, active: true, name: "E. Okafor" };
const departed = { role: "Manager" as const, active: false, name: "T. Oyelaran" };

describe("A-81 / A-28a — the write-off route is manager-only", () => {
  it("refuses a write-off with no authorizer at all", () => {
    // The shrinkage path. Ungated it is a copy taken in over the counter, cash
    // refunded, and the copy removed from stock with no Manager in the act.
    const why = routeStockRefusal("writeoff", undefined);

    expect(why).toBeDefined();
    expect(why).toMatch(/Manager/);
  });

  it("refuses an EMPLOYEE, which is the whole point of the gate", () => {
    // THIS IS THE TEST THAT WAS MISSING. The gate took any non-empty string,
    // so `routeStockRefusal("writeoff", "Marty Ng (Employee)")` was permitted:
    // what had moved into the lib was the PRESENCE of an authorizer, while
    // Manager-ness stayed in ManagerAuthorize — the screen. A-4 and A-48 refuse
    // exactly that shape, and A-81 says it of this gate by name.
    const why = routeStockRefusal("writeoff", employee);

    expect(why).toBeDefined();
    expect(why).toMatch(/E\. Okafor/);
    expect(why).toMatch(/Employee/);
  });

  it("refuses a Manager who is no longer active", () => {
    // M-04 d5 deactivates rather than deletes, so a departed Manager's row
    // outlives them. §6 has `manager_authorize` resolve an ACTIVE Manager at
    // the moment of the call, "so a demotion bites server-side at once".
    expect(routeStockRefusal("writeoff", departed)).toBeDefined();
  });

  it("permits an active Manager", () => {
    expect(routeStockRefusal("writeoff", manager)).toBeUndefined();
  });

  it("leaves the other two dispositions ungated, whoever is or is not there", () => {
    // E-06 decision 3's permissive Return is not being narrowed. A-81 reaches
    // the disposition that REMOVES a copy, not the assessment — and E-06
    // decision 7 is what holds refund and disposition apart so it can.
    expect(routeStockRefusal("sellable", undefined)).toBeUndefined();
    expect(routeStockRefusal("regrade", undefined)).toBeUndefined();
    expect(routeStockRefusal("sellable", employee)).toBeUndefined();
    expect(routeStockRefusal("regrade", employee)).toBeUndefined();
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

describe("E-06 decisions 29, 22 — when a Return's disposition may be chosen", () => {
  it("permits a draft, which is the whole of d29's reversal", () => {
    // d29 supersedes d20 and turns its direction around: the disposition is
    // chosen WHILE the Return is a draft. d20 refused exactly this, and the
    // loss it was protecting against is kept elsewhere — choosing mints
    // nothing, and the effects run inside the finish act.
    expect(routeDocumentRefusal({ state: "Open" })).toBeUndefined();
  });

  it("refuses a FINISHED Return, which d20 used to be the only state that permitted", () => {
    // The reversal, from the other end. At finish the choice was carried out,
    // and a finished artifact is immutable (M-07 d8 — corrections post
    // forward). Retired E-06-T15 asserted the opposite of this.
    const why = routeDocumentRefusal({ saleNumber: 100390, state: "Current" });

    expect(why).toBeDefined();
    expect(why).toMatch(/finished/);
    expect(why).toMatch(/decision 29/);
  });

  it("refuses a CLOSED Return for the same reason, not a different one", () => {
    // d23 is retired as moot by d29 — routing cannot outlive the close because
    // it cannot outlive the document. Closed is refused because it is
    // finished, which is the point: there is no longer a close-specific rule.
    expect(routeDocumentRefusal({ saleNumber: 100390, state: "Closed" })).toMatch(/decision 29/);
  });

  it("refuses a VOIDED Return by d22, and says so rather than citing d29", () => {
    // d22 is live and survives d29 untouched. It is checked FIRST because it
    // is the more specific refusal and the more useful sentence: a void says
    // the return did not happen. E-06-T26 holds this.
    const why = unrouteRefusalVoidDoc();

    expect(why).toBeDefined();
    expect(why).toMatch(/voided/);
    expect(why).toMatch(/decision 22/);
  });
});

function unrouteRefusalVoidDoc() {
  return routeDocumentRefusal({ saleNumber: 100391, state: "Void" });
}

describe("E-06 decision 29 — a Return cannot be finished with a line undecided", () => {
  const line = (over: Partial<Parameters<typeof finishReturnRefusal>[0][number]> = {}) => ({
    qty: -1,
    inventoryItemId: "i-1",
    describe: "Bill Evans — Sunday at the Village Vanguard",
    ...over,
  });

  it("refuses, and NAMES the line rather than reporting that something is missing", () => {
    // E-06-T22. A Return with four lines and one undecided is the case that
    // matters; "something is incomplete" sends the Employee hunting.
    const why = finishReturnRefusal([line()]);

    expect(why).toBeDefined();
    expect(why).toMatch(/Bill Evans/);
    expect(why).toMatch(/decision 29/);
  });

  it("permits finishing once every returned line carries a disposition", () => {
    expect(finishReturnRefusal([line({ routedTo: "sellable" })])).toBeUndefined();
  });

  it("counts the undecided lines and names the first of them", () => {
    const why = finishReturnRefusal([
      line({ routedTo: "regrade" }),
      line({ describe: "Alice Coltrane — Journey in Satchidananda" }),
      line({ describe: "Pharoah Sanders — Karma" }),
    ]);

    expect(why).toMatch(/^2 returned lines/);
    expect(why).toMatch(/Alice Coltrane/);
  });

  it("does not gate a sale line, or a refund-only line with no copy", () => {
    // Only a line that took stock IN has a disposition to make. A positive
    // quantity is something being sold on the same document, and a negative
    // line with no inventoryItemId refunded money without taking a disc back.
    expect(finishReturnRefusal([line({ qty: 1 })])).toBeUndefined();
    expect(finishReturnRefusal([line({ inventoryItemId: undefined })])).toBeUndefined();
  });
});

describe("E-06 decision 30 — a void un-routes, and refuses only when overtaken", () => {
  const routed = (status: InventoryItem["status"]) =>
    ({ internalBarcode: "200000090001", status }) as InventoryItem;

  it("permits the void while the copy is still as the routing left it", () => {
    // Back to sellable, still sellable. This is the ordinary case and the one
    // d10's blanket refusal forbade — and with it every Edit, which E-05 d31
    // defines as a Void plus a re-ring.
    expect(unrouteRefusal("sellable", routed("sellable"))).toBeUndefined();
  });

  it("permits the void on a written-off copy that is still written off", () => {
    // The expected status is the route's own, not `sellable` for everything.
    expect(unrouteRefusal("writeoff", routed("written_off"))).toBeUndefined();
  });

  it("refuses when the copy has been sold since, and names the copy", () => {
    // E-06-T25. "A copy is routed" tells a counter nothing it can act on.
    const why = unrouteRefusal("sellable", routed("sold"));

    expect(why).toBeDefined();
    expect(why).toMatch(/200000090001/);
    expect(why).toMatch(/sold since/);
    expect(why).toMatch(/decision 30/);
  });

  it("refuses when the copy is reserved on another Sale", () => {
    expect(unrouteRefusal("sellable", routed("held"))).toMatch(/reserved/);
  });

  it("refuses when the copy has been adjusted away since", () => {
    expect(unrouteRefusal("regrade", routed("written_off"))).toMatch(/written off since/);
  });

  it("refuses when the copy the routing produced cannot be found", () => {
    expect(unrouteRefusal("regrade", undefined)).toMatch(/decision 30/);
  });
});
