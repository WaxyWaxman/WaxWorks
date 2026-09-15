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
