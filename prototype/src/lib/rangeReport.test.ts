import { describe, expect, it } from "vitest";
import type { CloseBatch } from "../data/types";
import { SUMMARY_SCHEMA_VERSION, type DayBreakdown } from "./dayBreakdown";
import { computeRangeReport, presetRange } from "./rangeReport";

// M-03 d27, d13 — a range report SUMS stored batch summaries rather than
// querying Sales. A-83 makes the stored summary the schema of every report a
// range can show; A-84 retires a batch on undo rather than rewriting it.

/** A summary carrying only what a given test reads, shaped as one. */
const summary = (over: Partial<DayBreakdown> = {}): DayBreakdown =>
  ({
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    fileInfo: { start: "2026-09-01T11:00:00.000Z", end: "2026-09-01T17:00:00.000Z", createdAt: "x" },
    bySection: [],
    salesFooter: { items: 0, retail: 0, discount: 0, net: 0, transactions: 0, discountPctOfSales: null, averageSale: null },
    byTaxLine: [],
    byTender: [],
    undepositedTotal: null,
    cashNet: null,
    byCustomerType: [],
    perHour: [],
    byEmployee: [],
    tenderingDetails: [],
    ...over,
  }) as unknown as DayBreakdown;

const batch = (id: string, day: string, over: Partial<CloseBatch> = {}): CloseBatch =>
  ({
    id,
    at: `${day}T19:30:00.000Z`,
    by: "R. Delacroix",
    saleIds: [],
    summary: summary() as unknown as CloseBatch["summary"],
    summaryVersion: SUMMARY_SCHEMA_VERSION,
    ...over,
  }) as CloseBatch;

const withSales = (items: number, retail: number, net: number, transactions: number) =>
  summary({
    bySection: [{ code: "VI", label: "VINYL", items, retail, discount: retail - net, net, amount: net }],
    salesFooter: { items, retail, discount: retail - net, net, transactions, discountPctOfSales: null, averageSale: null },
  }) as unknown as CloseBatch["summary"];

const run = (batches: CloseBatch[], from = "2026-09-01", to = "2026-09-30") =>
  computeRangeReport(batches, from, to, "2026-09-19T10:00:00.000Z");

describe("M-03 d27 — a range sums closed batches, and says how many", () => {
  it("counts the closes it summed, because a range missing one is short", () => {
    const r = run([batch("b1", "2026-09-01"), batch("b2", "2026-09-02")]);
    expect(r.batchCount).toBe(2);
  });

  it("sums the sections and the footer across batches", () => {
    const r = run([
      batch("b1", "2026-09-01", { summary: withSales(10, 100, 90, 4) }),
      batch("b2", "2026-09-02", { summary: withSales(5, 50, 50, 2) }),
    ]);
    expect(r.bySection[0].items).toBe(15);
    expect(r.bySection[0].retail).toBe(150);
    expect(r.salesFooter.net).toBe(140);
    expect(r.salesFooter.transactions).toBe(6);
    // Derived over the SUM, never averaged from the parts.
    expect(r.salesFooter.averageSale).toBe(23.33);
  });

  it("excludes a batch outside the range", () => {
    const r = run([batch("b1", "2026-09-01"), batch("b2", "2026-10-05")], "2026-09-01", "2026-09-30");
    expect(r.batchCount).toBe(1);
  });

  it("carries seven sections and NOT the per-transaction listing", () => {
    const r = run([batch("b1", "2026-09-01")]);
    expect(r).not.toHaveProperty("tenderingDetails");
  });

  it("averages per hour OF THE DAY, so a month is 24 rows at most", () => {
    const r = run([
      batch("b1", "2026-09-01", {
        summary: summary({ perHour: [{ hour: 11, transactions: 4, value: 100, voids: 0 }] }) as unknown as CloseBatch["summary"],
      }),
      batch("b2", "2026-09-02", {
        summary: summary({ perHour: [{ hour: 11, transactions: 6, value: 200, voids: 2 }] }) as unknown as CloseBatch["summary"],
      }),
    ]);
    expect(r.perHourOfDay).toHaveLength(1);
    expect(r.perHourOfDay[0].days).toBe(2);
    expect(r.perHourOfDay[0].transactions).toBe(5); // (4 + 6) / 2
    expect(r.perHourOfDay[0].value).toBe(150);
  });
});

describe("A-84 — a retired batch is history and is never summed", () => {
  it("leaves an undone close out of the range entirely", () => {
    const r = run([
      batch("b1", "2026-09-01", { summary: withSales(10, 100, 100, 1) }),
      batch("b2", "2026-09-02", { summary: withSales(999, 999, 999, 9), undoneAt: "2026-09-03T09:00:00.000Z", undoneBy: "R. Delacroix" }),
    ]);
    expect(r.batchCount).toBe(1);
    expect(r.salesFooter.net).toBe(100);
  });

  it("keeps the retired batch's own summary intact — retiring is not erasing", () => {
    const retired = batch("b2", "2026-09-02", {
      summary: withSales(7, 70, 70, 3),
      undoneAt: "2026-09-03T09:00:00.000Z",
    });
    // A-84 — the batch keeps its id, timestamp, closing User and the summary it
    // computed. Nothing in the range path touches it.
    run([retired]);
    expect((retired.summary as unknown as DayBreakdown).salesFooter.net).toBe(70);
    expect(retired.by).toBe("R. Delacroix");
  });
});

describe("A-83 — the stored summary is the schema, and a short batch is counted not filled", () => {
  it("counts a batch whose summary predates the current shape", () => {
    const r = run([
      batch("b1", "2026-09-01"),
      batch("b2", "2026-09-02", { summaryVersion: SUMMARY_SCHEMA_VERSION - 1 }),
    ]);
    expect(r.batchCount).toBe(2);
    expect(r.shortBatchCount).toBe(1);
  });

  it("counts a batch that stored no summary at all", () => {
    const r = run([batch("b1", "2026-09-01", { summary: undefined, summaryVersion: undefined })]);
    expect(r.shortBatchCount).toBe(1);
  });

  it("does NOT zero-fill a section the older batches could not answer for", () => {
    // A zero a reader cannot tell from an absence is the invented number A-81
    // exists to keep off a report. The figure reports over the batches that
    // carry it; the rest are counted.
    const r = run([
      batch("b1", "2026-09-01", { summary: withSales(10, 100, 100, 1) }),
      batch("b2", "2026-09-02", { summary: undefined, summaryVersion: undefined }),
    ]);
    expect(r.bySection).toHaveLength(1);
    expect(r.bySection[0].net).toBe(100);
    expect(r.shortBatchCount).toBe(1);
    // The reader is told, rather than shown a total that silently means less.
    expect(r.batchCount).toBe(2);
  });

  it("reports nothing rather than zero where no batch answered at all", () => {
    const r = run([]);
    expect(r.batchCount).toBe(0);
    expect(r.salesFooter.averageSale).toBeNull();
    expect(r.undepositedTotal).toBeNull();
    expect(r.cashNet).toBeNull();
    expect(r.start).toBeNull();
  });
});

describe("M-03 d22, d17 — the range prints customer types in the close's own order", () => {
  it("does not let the order depend on which day happened to sell to whom", () => {
    const typed = (label: string) => ({ label, transactions: 1, items: 1, retail: 10, discount: 0, net: 10 });
    const r = run([
      batch("b1", "2026-09-01", {
        summary: summary({ byCustomerType: [typed("Business"), typed("Walk-in")] }) as unknown as CloseBatch["summary"],
      }),
      batch("b2", "2026-09-02", {
        summary: summary({ byCustomerType: [typed("Staff"), typed("Regular")] }) as unknown as CloseBatch["summary"],
      }),
    ]);
    expect(r.byCustomerType.map((x) => x.label)).toEqual(["Regular", "Staff", "Business", "Walk-in"]);
  });
});

describe("presetRange — M-03 d27: the three ranges the shop actually asks for", () => {
  const today = new Date("2026-09-19T12:00:00.000Z");

  it("runs this month from the first to today", () => {
    expect(presetRange("this-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-19" });
  });

  it("runs last month whole, ending on its own last day", () => {
    expect(presetRange("last-month", today)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("runs year to date from 1 January", () => {
    expect(presetRange("ytd", today)).toEqual({ from: "2026-01-01", to: "2026-09-19" });
  });
});
