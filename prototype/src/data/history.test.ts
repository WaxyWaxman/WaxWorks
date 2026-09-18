/**
 * What this asserts is NOT the figures — they move with the calendar by
 * design. It asserts the two invariants the generated month would be worthless
 * without: that every artifact's journal balances and resolves every seam it
 * touches, and that no copy is ever sold before it was received.
 *
 * A generated month that got either wrong would put a plausible-looking but
 * wrong shop in front of a reviewer, which is worse than the empty one it
 * replaced.
 */

import { describe, expect, it } from "vitest";
import { buildChart } from "../lib/chart";
import { isImbalanced } from "../lib/journal";
import { invoiceTotal, saleTotals, type TaxContext } from "../lib/totals";
import { stockFacts } from "../lib/stockState";
import { buildHistory, type GeneratedHistory } from "./history";
import {
  CUSTOMERS,
  DEFAULT_TAX_GROUP,
  HOME_CURRENCY,
  RECORDS,
  SECTIONS,
  STORE_DETAILS,
  TAX_GROUP_CELLS,
  TAX_TYPES,
  TENDERS,
} from "./seed";

const CHART = buildChart({ sections: SECTIONS, tenders: TENDERS, taxTypes: TAX_TYPES });

// A fixed anchor, so a failure is reproducible rather than "it went red on a
// Tuesday". The generator's own default is the real clock.
const ANCHOR = new Date(2026, 8, 17); // 17 September 2026, local

const build = (anchor = ANCHOR): GeneratedHistory =>
  buildHistory({
    accounts: CHART.accounts,
    mappings: CHART.mappings,
    sections: SECTIONS,
    tenders: TENDERS,
    taxTypes: TAX_TYPES,
    taxGroupCells: TAX_GROUP_CELLS,
    defaultTaxGroup: DEFAULT_TAX_GROUP,
    homeCurrency: HOME_CURRENCY,
    storeId: STORE_DETAILS.storeId,
    anchor,
  });

describe("the generated month", () => {
  const h = build();

  it("resolves every seam every journal touches", () => {
    // M-07 d10 — an unresolved seam is the thing that sends a difference to
    // Suspense, and d11 maps every seam at setup precisely so this is empty.
    expect(h.unresolved).toEqual([]);
  });

  it("writes a journal that balances for every artifact", () => {
    expect(h.journals.length).toBeGreaterThan(20);
    const broken = h.journals.filter((b) => isImbalanced(b));
    expect(broken.map((b) => `${b.source}: ${b.suspense}`)).toEqual([]);
  });

  it("writes one journal per artifact and no more", () => {
    // M-07 d12 — a journal is written by the artifact that causes it. One per
    // finalized Invoice, one per PaymentBatch, one per CloseBatch.
    expect(h.journals.length).toBe(h.invoices.length + h.paymentBatches.length + h.closeBatches.length);
    expect(new Set(h.journals.map((b) => b.id)).size).toBe(h.journals.length);
  });

  it("credits Accounts payable exactly what each Invoice totals", () => {
    for (const iv of h.invoices) {
      const batch = h.journals.find((b) => b.source === `invoice:${iv.invoiceNumber}`);
      expect(batch, iv.invoiceNumber).toBeDefined();
      const ap = CHART.accounts.find((a) => a.role === "accounts-payable")!;
      const credited = batch!.lines
        .filter((l) => l.accountId === ap.id)
        .reduce((s, l) => s + (l.credit ?? 0), 0);
      const rate = iv.exchangeRate ?? 1;
      expect(credited).toBeCloseTo(invoiceTotal(iv) * rate, 2);
    }
  });

  it("never sells a copy before it was received", () => {
    const itemById = new Map(h.inventory.map((i) => [i.id, i]));
    const lineToInvoice = new Map<string, string>();
    for (const iv of h.invoices) for (const l of iv.lines) lineToInvoice.set(l.id, iv.finalizedAt!);

    for (const sale of h.sales) {
      for (const line of sale.lines) {
        if (!line.inventoryItemId) continue;
        const item = itemById.get(line.inventoryItemId);
        expect(item, `${sale.id} points at a copy that does not exist`).toBeDefined();
        expect(item!.status).toBe("sold");
        const finalizedAt = lineToInvoice.get(item!.invoiceLineId!);
        expect(finalizedAt, `${item!.id} has no Invoice behind it`).toBeDefined();
        expect(finalizedAt! <= sale.tenderedAt!).toBe(true);
      }
    }
  });

  it("sells each copy exactly once", () => {
    const sold = h.sales.flatMap((s) => s.lines.map((l) => l.inventoryItemId).filter(Boolean));
    expect(new Set(sold).size).toBe(sold.length);
  });

  it("closes every Sale into a batch, and every batch holds only its own day", () => {
    const batchIds = new Set(h.closeBatches.map((b) => b.id));
    for (const sale of h.sales) {
      expect(sale.state).toBe("Closed");
      expect(batchIds.has(sale.batchId!)).toBe(true);
    }
    const claimed = h.closeBatches.flatMap((b) => b.saleIds);
    expect(claimed.length).toBe(h.sales.length);
    expect(new Set(claimed).size).toBe(claimed.length);

    // M-07 d14 groups journal lines by business date, so a batch spanning two
    // days would still be correct — but a generated one never should.
    for (const b of h.closeBatches) {
      const dates = new Set(b.saleIds.map((id) => h.sales.find((s) => s.id === id)!.tenderedAt!.slice(0, 10)));
      expect(dates.size, b.id).toBe(1);
    }
  });

  it("tenders each Sale for exactly what it came to", () => {
    for (const sale of h.sales) {
      const ctx: TaxContext = {
        types: TAX_TYPES,
        cells: TAX_GROUP_CELLS,
        groupId: sale.taxGroupId!,
        at: sale.tenderedAt!.slice(0, 10),
      };
      const tendered = sale.tenders.reduce((s, t) => s + t.amount, 0);
      expect(tendered, sale.id).toBeCloseTo(saleTotals(sale, ctx).grand, 2);
    }
  });

  it("issues Sale numbers in ascending order", () => {
    const numbers = h.sales.map((s) => s.saleNumber!);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    expect(h.nextSaleNumber).toBe(numbers[numbers.length - 1] + 1);
  });

  it("ends yesterday, and leaves today empty to be traded", () => {
    const dates = h.sales.map((s) => s.tenderedAt!.slice(0, 10)).sort();
    expect(dates[dates.length - 1]).toBe("2026-09-16");
    expect(dates.some((d) => d === "2026-09-17")).toBe(false);
  });

  // E-03's four stock states. `seed.ts` used to reach *Had before* with two
  // hand-written Sales carrying no copy, which is what made them impossible to
  // journal honestly. These assert the band is still reached — and reached the
  // way a real shop reaches it, by selling the last copy.
  describe("the sold-out titles", () => {
    const facts = (recordId: string) =>
      stockFacts(RECORDS.find((r) => r.id === recordId)!, {
        inventory: h.inventory,
        pendingOrders: [],
        invoices: h.invoices,
        sales: h.sales,
      });

    it("puts both in Had before, with nothing left on the floor", () => {
      for (const id of ["r-madvillainy", "r-astral"]) {
        const f = facts(id);
        expect(f.state, id).toBe("before");
        expect(f.onHand, id).toBe(0);
        expect(f.everSold, id).toBeGreaterThan(0);
      }
    });

    it("keeps the two recency stamps far apart", () => {
      // The seed's own intent: one recent sell-out and one long-cold, so the
      // stamp has both shapes to render.
      const recent = facts("r-madvillainy").lastSoldAt!;
      const cold = facts("r-astral").lastSoldAt!;
      expect(recent > cold).toBe(true);
      const days = (a: string) => (ANCHOR.getTime() - new Date(a.replace(" ", "T")).getTime()) / 86_400_000;
      expect(days(recent)).toBeLessThan(31);
      expect(days(cold)).toBeGreaterThan(120);
    });

    it("gives every sold-out copy an Invoice and a cost, so the close has a COGS to post", () => {
      const copies = h.inventory.filter((i) => i.recordId === "r-madvillainy" || i.recordId === "r-astral");
      expect(copies.length).toBeGreaterThan(0);
      for (const c of copies) {
        expect(c.status).toBe("sold");
        expect(c.invoiceLineId, c.id).toBeDefined();
        expect(c.cost, c.id).toBeGreaterThan(0);
      }
    });
  });

  it("gives E-06 a prior Sale to link a Return against", () => {
    // Return.tsx builds its picker from Sales that carry a number and a
    // positive line for the Record being returned.
    const linkable = h.sales.filter((s) => s.saleNumber && s.lines.some((l) => l.recordId && l.qty > 0));
    expect(linkable.length).toBeGreaterThan(50);
  });

  it("gives the Customers seed.ts already carries a history", () => {
    // Including the wholesale account, whose group has every cell blank
    // (M-06 d15) — so the month proves an out-of-scope Sale end to end.
    for (const c of CUSTOMERS) {
      expect(h.sales.some((s) => s.customerId === c.id), c.name).toBe(true);
    }
    const wholesale = h.sales.filter((s) => s.customerId === "c-lp");
    expect(wholesale.length).toBeGreaterThan(0);
    for (const s of wholesale) {
      for (const l of s.lines) expect(l.tax ?? []).toEqual([]);
    }
  });

  it("generates the same shop twice from the same day", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});
