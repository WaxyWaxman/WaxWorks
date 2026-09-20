import { describe, expect, it } from "vitest";
import { priceLine } from "./pricing";

// E-02 d51 — a price somebody DECIDED beats a price the system COMPUTED, and a
// thin margin is warned about rather than priced away.
//
// The fixture is E-02's own worked example: list 27.99 marked up by a 60%
// supplier Discount gives 44.78, rounded to the nearest .99 — 44.99 (A-49).

const base = { listPrice: 27.99, lineDiscountPct: 50, supplierMarkupPct: 60, priceEndingMinor: 99 };

describe("pre-fill precedence (d51)", () => {
  it("computes a suggestion from the supplier's markup when nothing is decided", () => {
    const p = priceLine(base);
    expect(p.computed).toBe(44.99);
    expect(p.prefill).toBe(44.99);
    expect(p.cost).toBe(14.0);
  });

  it("takes the decided price over the computed one", () => {
    // The sticky price — one field, whether it got there from the last
    // New-mode receipt (d12) or from adoption (E-03 d20).
    const p = priceLine({ ...base, decidedPrice: 34.99 });
    expect(p.prefill).toBe(34.99);
    expect(p.computed).toBe(44.99);
  });

  it("falls back to the computed price on a second-hand receipt", () => {
    // d11 keeps sticky pricing to New stock only, so the caller passes no
    // decided price and second-hand is priced per copy.
    expect(priceLine({ ...base, decidedPrice: undefined }).prefill).toBe(44.99);
  });
});

describe("the margin complaint (d51)", () => {
  it("warns when the decided price is under what the supplier's Discount implies", () => {
    // 34.99 against a 14.00 cost is 60.0%; the computed 44.99 would have been
    // 68.9%. The price stands and the shortfall is said out loud.
    const p = priceLine({ ...base, decidedPrice: 34.99, acceptedPrice: 34.99 });
    expect(p.thinMargin).toBe(true);
    expect(p.belowCost).toBe(false);
    expect(p.marginPct).toBeCloseTo(60.0, 1);
    expect(p.targetMarginPct).toBeCloseTo(68.88, 1);
    // The price is NOT moved — that is the whole decision.
    expect(p.prefill).toBe(34.99);
  });

  it("stays quiet when the decided price meets the supplier's markup", () => {
    const p = priceLine({ ...base, decidedPrice: 49.99, acceptedPrice: 49.99 });
    expect(p.thinMargin).toBe(false);
  });

  it("stays quiet at exactly the target, since the complaint is about falling short", () => {
    const p = priceLine({ ...base, acceptedPrice: 44.99 });
    expect(p.marginPct).toBe(p.targetMarginPct);
    expect(p.thinMargin).toBe(false);
  });

  it("leaves below-cost to d35's ReviewFlag rather than doubling up", () => {
    // Below cost is rare and serious and already raises a flag. A thin margin
    // is neither, and flagging every one would fill the queue with rows nobody
    // reads — A-48's reasoning in reverse.
    const p = priceLine({ ...base, acceptedPrice: 9.99 });
    expect(p.belowCost).toBe(true);
    expect(p.thinMargin).toBe(false);
  });

  it("says nothing before a cost has been entered", () => {
    // With no list price the margin computes to 100%, a number that invites
    // acceptance and means nothing.
    const p = priceLine({ listPrice: 0, lineDiscountPct: 0, supplierMarkupPct: 60, priceEndingMinor: 99 });
    expect(p.thinMargin).toBe(false);
    expect(p.belowCost).toBe(false);
  });

  it("does NOT fire on a cost rise alone, and that is a real limit", () => {
    // The shop prices off LIST marked up, not off cost, so when a supplier
    // gives less discount on the same list both the cost and the implied
    // margin fall together and the suggestion is still being met. The warning
    // is therefore "the decided price is under what we would have charged",
    // not "this line earns less than it used to".
    //
    // Margin erosion by a shrinking supplier discount is real and this cannot
    // see it. Catching that needs a comparison against past receipts, which is
    // a different question from the one d51 asked.
    const cheap = priceLine({ ...base, decidedPrice: 44.99, acceptedPrice: 44.99 });
    const dearer = priceLine({ ...base, lineDiscountPct: 20, decidedPrice: 44.99, acceptedPrice: 44.99 });
    expect(dearer.cost).toBeGreaterThan(cheap.cost);
    expect(dearer.marginPct).toBeLessThan(cheap.marginPct);
    expect(dearer.thinMargin).toBe(false);
    expect(cheap.thinMargin).toBe(false);
  });

  it("fires on exactly the case the decision is for: a stale sticky price", () => {
    // A record priced 34.99 last year, now suggested at 44.99. The price
    // stands so the customer sees what they saw before, and the shortfall is
    // said out loud instead.
    const p = priceLine({ ...base, decidedPrice: 34.99, acceptedPrice: 34.99 });
    expect(p.thinMargin).toBe(true);
    expect(p.prefill).toBe(34.99);
    expect(p.targetMarginPct - p.marginPct).toBeCloseTo(8.88, 1);
  });
});
