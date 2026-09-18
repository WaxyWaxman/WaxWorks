import { describe, expect, it } from "vitest";
import { TAX_GROUP_CELLS, TAX_TYPES } from "../data/seed";
import { parseCell, resolveLineTax, roundHalfAwayFromZero, taxTypeUseCount, taxTypeWrite } from "./tax";
import type { TaxType } from "../data/types";

const AT = "2026-09-15";
const spec = (groupId: string, code: string) =>
  TAX_GROUP_CELLS.find((c) => c.groupId === groupId && c.productTaxCode === code)!.spec;

// M-06 d57 / architecture A-63 — a tax type has no Active flag; a tax is live
// where a cell names it. These pin the defect that decision closed: resolution
// used to filter on a stored flag, so switching a type off while cells still
// named it quietly charged less tax.

describe("a tax type is live iff a cell names it (A-63)", () => {
  it("charges whatever the cell names, with no flag to consult", () => {
    const qc = resolveLineTax(29.99, spec("tg-qc", "1"), TAX_TYPES, AT);
    expect(qc.map((c) => c.name)).toEqual(["GST", "QST"]);
    expect(qc.map((c) => c.amount)).toEqual([1.5, 2.99]);
  });

  it("cannot be switched off out from under a cell", () => {
    // The old shape: `{...t, active: false}` made resolution skip the type and
    // the line silently charged less. There is now no flag to set, so the only
    // way to stop charging QST is to clear `b` from the cell — which is what
    // the next assertion does, and it is a deliberate, logged edit.
    const withoutQst = resolveLineTax(29.99, "a", TAX_TYPES, AT);
    expect(withoutQst.map((c) => c.name)).toEqual(["GST"]);
    expect(TAX_TYPES.every((t) => !("active" in t))).toBe(true);
  });

  it("treats a blank cell as out of scope, not as zero-rated (d15)", () => {
    expect(resolveLineTax(25, "", TAX_TYPES, AT)).toEqual([]);
    expect(parseCell("").codes).toEqual([]);
  });

  it("compounds only where the cell says so (d16)", () => {
    // The fifteen cents in M-06's worked example is the evaluation order, and
    // nothing normalises it away.
    const flat = resolveLineTax(29.99, "ab", TAX_TYPES, AT);
    const compound = resolveLineTax(29.99, "ab+", TAX_TYPES, AT);
    expect(flat[1].amount).toBe(2.99);
    expect(compound[1].amount).toBe(3.14);
  });
});

describe("derived liveness (A-63)", () => {
  it("counts the cells naming a type, which is what the editor reports", () => {
    expect(taxTypeUseCount(TAX_GROUP_CELLS, "a")).toBeGreaterThan(0);
    expect(taxTypeUseCount(TAX_GROUP_CELLS, "b")).toBeGreaterThan(0);
    // A letter no cell names is unused — which is the honest word for it,
    // rather than "off". No seeded type is in that state; every one is charged
    // somewhere, so the seed carries no dead rows.
    expect(taxTypeUseCount(TAX_GROUP_CELLS, "q")).toBe(0);
    for (const t of TAX_TYPES) {
      expect(taxTypeUseCount(TAX_GROUP_CELLS, t.code), t.name).toBeGreaterThan(0);
    }
  });

  it("keeps a zero-rated type live and reportable, unlike a blank cell (d15)", () => {
    // `z` is a real tax type at 0 ppm, named by every group for product tax
    // code 3. It resolves to a component worth nothing, where a blank cell
    // resolves to no component at all — the two are deliberately distinct, and
    // a stored Active flag was the thing most likely to blur them.
    const zeroRated = resolveLineTax(40, "z", TAX_TYPES, AT);
    expect(zeroRated).toHaveLength(1);
    expect(zeroRated[0].name).toBe("Zero-rated");
    expect(zeroRated[0].amount).toBe(0);
    expect(resolveLineTax(40, "", TAX_TYPES, AT)).toHaveLength(0);
  });

  it("sees a compound cell as using both of its taxes", () => {
    expect(taxTypeUseCount([{ spec: "ab+" }], "a")).toBe(1);
    expect(taxTypeUseCount([{ spec: "ab+" }], "b")).toBe(1);
    expect(taxTypeUseCount([{ spec: "a" }], "b")).toBe(0);
  });

  it("never names a tax type the table does not hold", () => {
    const codes = new Set(TAX_TYPES.map((t) => t.code));
    for (const cell of TAX_GROUP_CELLS) {
      for (const code of parseCell(cell.spec).codes) {
        expect(codes.has(code), `${cell.groupId}/${cell.productTaxCode} names ${code}`).toBe(true);
      }
    }
  });
});

describe("A-47 rounding", () => {
  it("rounds half away from zero, so a refund mirrors its sale", () => {
    // Math.round is half-UP and gets -2.505 wrong, which only shows on
    // negative amounts — which is to say on Returns (E-06 d1).
    expect(roundHalfAwayFromZero(2.505)).toBe(2.51);
    expect(roundHalfAwayFromZero(-2.505)).toBe(-2.51);
    expect(roundHalfAwayFromZero(2.675)).toBe(2.68);
  });
});

describe("M-06 d52 — an elapsed pending change is promoted, never silently dropped", () => {
  const gst = (over: Partial<TaxType> = {}): TaxType =>
    ({ code: "a", name: "GST", ratePpm: 50_000, ...over }) as TaxType;

  it("promotes the elapsed rate when a new change is queued on top of it", () => {
    // The bug this was written for. 5% current, 10% queued for today and now in
    // force; the Manager hears about 12% from December and queues it. The 10%
    // must become the current rate — it is the rate the shop is actually
    // charging — and it used to vanish, leaving 5% and no record of it at all.
    const existing = gst({ pendingRatePpm: 100_000, pendingFrom: "2026-09-18" });
    const row = gst({ ratePpm: 50_000, pendingRatePpm: 120_000, pendingFrom: "2026-12-01" });

    const next = taxTypeWrite(existing, row, "2026-09-18");

    expect(next.ratePpm).toBe(100_000);
    expect(next.pendingRatePpm).toBe(120_000);
    expect(next.pendingFrom).toBe("2026-12-01");
  });

  it("promotes even when the new write queues nothing", () => {
    // Clearing the pending pair must still bank the elapsed rate.
    const existing = gst({ pendingRatePpm: 100_000, pendingFrom: "2026-09-17" });
    const row = gst({ ratePpm: 50_000 });

    const next = taxTypeWrite(existing, row, "2026-09-18");

    expect(next.ratePpm).toBe(100_000);
    expect(next.pendingRatePpm).toBeUndefined();
  });

  it("lets an explicit rate edit win over the promotion", () => {
    // The one case the caller's intent is unambiguous: they typed in the rate
    // field, so that is the rate.
    const existing = gst({ pendingRatePpm: 100_000, pendingFrom: "2026-09-18" });
    const row = gst({ ratePpm: 70_000 });

    expect(taxTypeWrite(existing, row, "2026-09-18").ratePpm).toBe(70_000);
  });

  it("leaves a pending change that has NOT elapsed alone", () => {
    const existing = gst({ pendingRatePpm: 100_000, pendingFrom: "2026-12-01" });
    const row = gst({ ratePpm: 50_000, pendingRatePpm: 120_000, pendingFrom: "2027-01-01" });

    const next = taxTypeWrite(existing, row, "2026-09-18");

    expect(next.ratePpm).toBe(50_000);
    expect(next.pendingRatePpm).toBe(120_000);
  });

  it("a brand new type carries whatever it was given", () => {
    expect(taxTypeWrite(undefined, gst({ ratePpm: 50_000 }), "2026-09-18").ratePpm).toBe(50_000);
  });
});
