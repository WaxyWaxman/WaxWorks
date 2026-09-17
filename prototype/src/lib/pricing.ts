import { roundToEnding } from "./money";

// E-02's pricing rules, as pure functions.
//
// d51 — **a price somebody DECIDED beats a price the system COMPUTED**, and
// computation is what fills the gap when nobody has decided yet. Where the
// decided price yields a thin margin against this receipt's actual cost, the
// system says so and LEAVES THE PRICE ALONE: overriding it would quietly
// re-price a record a customer saw at one figure last week, and margin erosion
// is a management problem rather than a pricing-desk one.

export interface LinePricing {
  /** Post-discount cost of this line — E-02 d7's Ext. Price. */
  cost: number;
  /** What the markup rule alone would suggest, before any decided price. */
  computed: number;
  /** What actually pre-fills: the decided price if there is one. */
  prefill: number;
  /** Margin at the price being accepted. */
  marginPct: number;
  /** Margin the supplier's own Discount implies, at this cost. */
  targetMarginPct: number;
  /** d35 — below cost proceeds and raises a ReviewFlag. Unchanged by d51. */
  belowCost: boolean;
  /** d51 — above cost, but under what this supplier's markup implies. Warns. */
  thinMargin: boolean;
}

export function priceLine(input: {
  listPrice: number;
  /** This line's own Disc%, read off the invoice — drives cost (d7). */
  lineDiscountPct: number;
  /** The Supplier's Discount field — the markup this shop expects (M-01). */
  supplierMarkupPct: number;
  /**
   * The decided price, where one exists. This is the **sticky price**, and it
   * is one field with two possible sources: the last accepted New-mode receipt
   * (d12) or a price set at adoption ([E-03] d20), which is stored as the
   * sticky price rather than beside it. d51 lists them as two terms because it
   * was written before d20 was built; there is one field, and A-35 is why
   * there is not a second.
   *
   * Undefined on a **second-hand** receipt: d11 keeps sticky pricing to New
   * stock only, and second-hand is priced per copy.
   */
  decidedPrice?: number;
  /** The price being accepted, if the operator has typed one. */
  acceptedPrice?: number;
  /** M-06 d44 — the store's configured price ending, in minor units (99, 95, 0). */
  priceEndingMinor: number;
}): LinePricing {
  const cost = round2(input.listPrice * (1 - input.lineDiscountPct / 100));
  // A-49 — nearest configured ending, and only ever a suggestion (d32).
  const computed = roundToEnding(input.listPrice * (1 + input.supplierMarkupPct / 100), input.priceEndingMinor);
  const prefill = input.decidedPrice ?? computed;
  const sell = input.acceptedPrice ?? prefill;

  const marginOn = (price: number) => (price > 0 ? round2(((price - cost) / price) * 100) : 0);
  const marginPct = marginOn(sell);
  // The benchmark is the margin the COMPUTED suggestion would have produced at
  // this cost — so the threshold is the Supplier's own Discount field and
  // nothing has to be configured. M-06 d43 refused a configurable tolerance for
  // a governance figure; this avoids the question by reusing a figure the shop
  // already maintains per supplier (M-01).
  const targetMarginPct = marginOn(computed);

  const belowCost = sell > 0 && sell < cost;
  return {
    cost,
    computed,
    prefill,
    marginPct,
    targetMarginPct,
    belowCost,
    // Strictly below target, with no tolerance. d51 names the consequence and
    // accepts it: a shop that never revisits its sticky prices will be told
    // every time. A tolerance would be the configurable threshold d51 went out
    // of its way not to invent.
    thinMargin: sell > 0 && !belowCost && marginPct < targetMarginPct,
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
