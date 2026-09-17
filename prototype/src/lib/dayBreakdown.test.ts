import { describe, expect, it } from "vitest";
import {
  GENRES,
  GIFT_CARD_GENRE_ID,
  NON_TRACKED,
  SECTIONS,
  TAX_GROUP_CELLS,
  TAX_TYPES,
} from "../data/seed";
import type { RecordEntry, Sale, SaleLine } from "../data/types";
import { computeDayBreakdown } from "./dayBreakdown";
import { resolveLineTax } from "./tax";
import type { TaxContext } from "./totals";

// M-03's *By Section* breakdown, which is the one report a wrong Section
// silently misstates. It was the last thing in the genre work verified only by
// reasoning; these tests close that.

const taxCtx: TaxContext = {
  types: TAX_TYPES,
  cells: [{ groupId: "tg-qc", productTaxCode: "1", spec: "ab" }],
  groupId: "tg-qc",
  at: "2026-09-15",
};

const record = (id: string, genreId: string): RecordEntry => ({
  id,
  artist: "A",
  title: "T",
  label: "L",
  catalogNo: "C",
  format: "LP",
  year: 2026,
  country: "CA",
  genreId,
  art: "💿",
  minOnHand: 0,
});

const line = (over: Partial<SaleLine>): SaleLine => ({
  id: "l1",
  kind: "item",
  title: "line",
  qty: 1,
  price: 10,
  discountPct: 0,
  productTaxCode: "1",
  ...over,
});

const sale = (lines: SaleLine[]): Sale =>
  ({
    id: "s1",
    state: "Current",
    isReturn: false,
    lines,
    tenders: [],
    log: [],
    createdAt: "2026-09-15",
  }) as unknown as Sale;

const bySection = (lines: SaleLine[], records: RecordEntry[]) =>
  Object.fromEntries(
    computeDayBreakdown([sale(lines)], records, taxCtx, [], GENRES, SECTIONS).bySection.map((r) => [
      r.label,
      r.amount,
    ]),
  );

describe("By Section (M-03, M-06 d20, d31)", () => {
  it("buckets an item line under its genre's parent Section", () => {
    const recs = [record("r1", "gn-folk-rock"), record("r2", "gn-books")];
    expect(
      bySection(
        [
          line({ id: "a", recordId: "r1", price: 30 }),
          line({ id: "b", recordId: "r2", price: 12 }),
        ],
        recs,
      ),
    ).toEqual({ VINYL: 30, MERCH: 12 });
  });

  it("buckets a non-tracked line through the genre on the line (d17)", () => {
    // Before d17 these landed in a generic bucket, because a non-tracked item
    // carried a Section and no genre. Freight rolls up into FREIGHT.
    expect(
      bySection([line({ id: "f", kind: "nontracked", genreId: "gn-freight", price: 8 })], []),
    ).toEqual({ FREIGHT: 8 });
  });

  it("keeps a gift card load out of gross and out of Section (M-03 d14)", () => {
    const b = computeDayBreakdown(
      [sale([line({ id: "g", kind: "giftcard-load", price: 25 })])],
      [],
      taxCtx,
      [],
      GENRES,
      SECTIONS,
    );
    expect(b.giftCardsLoaded).toBe(25);
    expect(b.grossSales).toBe(0);
    expect(b.bySection).toEqual([]);
  });

  it("excludes a Section flagged not-revenue (d20)", () => {
    // The flag is the mechanism, not a gift-card special case — so flipping it
    // on any Section keeps that Section out.
    const sections = SECTIONS.map((s) => (s.code === "VI" ? { ...s, countsAsRevenue: false } : s));
    const b = computeDayBreakdown(
      [sale([line({ id: "a", recordId: "r1", price: 30 })])],
      [record("r1", "gn-folk-rock")],
      taxCtx,
      [],
      GENRES,
      sections,
    );
    expect(b.bySection).toEqual([]);
  });

  it("shows an unresolvable genre as a gap rather than filing it (d31)", () => {
    expect(bySection([line({ id: "x", recordId: "r1", price: 5 })], [record("r1", "gn-nope")])).toEqual(
      { "—": 5 },
    );
  });
});

describe("the seeded non-tracked catalog (d17, d20)", () => {
  it("gives every entry a genre that resolves to a Section", () => {
    const byId = new Map(GENRES.map((g) => [g.id, g]));
    const codes = new Set(SECTIONS.map((s) => s.code));
    for (const nt of NON_TRACKED) {
      const g = byId.get(nt.genreId);
      expect(g, nt.code).toBeDefined();
      expect(codes.has(g!.section), `${nt.code} -> ${g!.section}`).toBe(true);
    }
  });

  it("treats freight and services as revenue, and gift cards as a liability (d20)", () => {
    const section = (code: string) => SECTIONS.find((s) => s.code === code)!;
    expect(section("FR").countsAsRevenue).toBe(true);
    expect(section("GC").countsAsRevenue).toBe(false);
  });

  it("resolves a gift card load to a non-taxable product code (d18, d15)", () => {
    // A load carried a hardcoded `1` and was therefore taxed at the standard
    // rate. d18 gives it a real catalog entry, so it resolves through the
    // `Gift card` genre like everything else — code `2`, which is BLANK in
    // every group: out of scope, which d15 keeps distinct from zero-rated.
    const genre = GENRES.find((g) => g.id === GIFT_CARD_GENRE_ID)!;
    expect(genre.productTaxCode).toBe("2");

    for (const groupId of new Set(TAX_GROUP_CELLS.map((c) => c.groupId))) {
      const cell = TAX_GROUP_CELLS.find((c) => c.groupId === groupId && c.productTaxCode === "2");
      expect(cell?.spec ?? "", groupId).toBe("");
    }

    // Quebec is the worst case: code `1` there is GST + QST, so the bug was
    // charging 14.975% on money the shop had merely received.
    const qcStandard = TAX_GROUP_CELLS.find(
      (c) => c.groupId === "tg-qc" && c.productTaxCode === "1",
    )!.spec;
    expect(resolveLineTax(25, qcStandard, TAX_TYPES, "2026-09-15")).toHaveLength(2);
    expect(resolveLineTax(25, "", TAX_TYPES, "2026-09-15")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * M-03 d16 — a pay-out is cash leaving the drawer, so the tape reports it
 * against cash rather than under a category of its own.
 */
describe("By tender — cash out is still cash (M-03 d16, E-05 d16)", () => {
  const tendered = (tenders: Sale["tenders"], lines: SaleLine[] = []) =>
    computeDayBreakdown(
      [{ ...sale(lines), tenders } as Sale],
      [],
      taxCtx,
      [],
      GENRES,
      SECTIONS,
    );

  const rows = (b: ReturnType<typeof tendered>) =>
    Object.fromEntries(b.byTender.map((t) => [t.label, t.amount]));

  it("gives a day of nothing but a pay-out a cash figure of -$20", () => {
    // The case that prompted this. Under its own `Pay-out` label the tape
    // carried NO cash line at all, so a day that ate $20 of the float read as
    // a category nobody reconciles rather than as cash going out.
    const b = tendered([{ id: "t", type: "Pay-out", amount: -20, note: "courier COD" }] as Sale["tenders"]);

    expect(rows(b)["Cash — pay-outs"]).toBe(-20);
    expect(b.cashNet).toBe(-20);
    expect(rows(b)["Pay-out"]).toBeUndefined();
  });

  it("nets the pay-out against the day's cash without hiding either movement", () => {
    // d14 — the tender column reports every movement, not a net figure. Both
    // are still rows; the net sits beside them as a subtotal.
    const b = tendered([
      { id: "t1", type: "Cash", amount: 120 },
      { id: "t2", type: "Pay-out", amount: -20, note: "window cleaner" },
    ] as Sale["tenders"]);

    expect(rows(b)["Cash"]).toBe(120);
    expect(rows(b)["Cash — pay-outs"]).toBe(-20);
    expect(b.cashNet).toBe(100);
  });

  it("was already right about a cash refund, and stays right", () => {
    // A refund is tendered as a NEGATIVE `Cash` tender (E-06), so it always
    // netted into the cash row. Asserted so the pay-out change cannot quietly
    // move it somewhere else.
    const b = tendered([
      { id: "t1", type: "Cash", amount: 120 },
      { id: "t2", type: "Cash", amount: -50, note: "Refund paid from till" },
    ] as Sale["tenders"]);

    expect(rows(b)["Cash"]).toBe(70);
    expect(b.cashNet).toBe(70);
  });

  it("reports no cash figure at all on a card-only day", () => {
    // Rather than a `$0.00` that reads as a counted drawer.
    const b = tendered([{ id: "t", type: "Credit Card", amount: 48 }] as Sale["tenders"]);

    expect(b.cashNet).toBeNull();
    expect(rows(b)["Credit Card"]).toBe(48);
  });

  it("still lists the pay-out with its note under Movements (d9)", () => {
    // Folding it into cash must not lose it: d9 captures pay-outs with their
    // notes precisely because money leaving the till is otherwise invisible.
    const b = tendered([{ id: "t", type: "Pay-out", amount: -20, note: "courier COD" }] as Sale["tenders"]);

    expect(b.payouts).toEqual([{ saleLabel: "—", note: "courier COD", amount: -20 }]);
  });
});
