import type { CloseBatch } from "../data/types";
import {
  SUMMARY_SCHEMA_VERSION,
  type CustomerTypeRow,
  type DayBreakdown,
  type EmployeeRow,
  type HourRow,
  type SalesFooter,
  type SectionSalesRow,
  type TaxLineRow,
  type TenderRowFigures,
} from "./dayBreakdown";
import { round2 } from "./totals";

/** The order §5 prints, matching `dayBreakdown`'s (M-03 d22). */
const CUSTOMER_TYPE_ORDER = ["Regular", "Staff", "Business", "Walk-in"];

const orderCustomerTypes = (rows: CustomerTypeRow[]): CustomerTypeRow[] =>
  [...rows].sort((a, b) => CUSTOMER_TYPE_ORDER.indexOf(a.label) - CUSTOMER_TYPE_ORDER.indexOf(b.label));

/**
 * M-03 d27 — the same report over an arbitrary date range: this month, last
 * month, year to date.
 *
 * **It sums stored batch summaries; it does not query Sales.** That is d27's
 * own choice and A-83's subject, and two things follow from it that are not
 * incidental:
 *
 * 1. **It carries seven of the eight sections.** *Tendering details* is a
 *    per-transaction listing and does not sum out of an aggregate, so a range
 *    would have to store every tender line twice or abandon summing for the
 *    whole report. Dropped rather than paged — a year of tender lines is tens
 *    of thousands of rows and is the one section that is a lookup rather than
 *    a reading.
 * 2. **It is only ever as complete as the closes inside it.** Sales sitting in
 *    a batch nobody has closed are invisible to it, including today's right up
 *    until the close runs, which is why `batchCount` is printed rather than
 *    tucked away and why *View Subtotal* stays the only way to see the day you
 *    are standing in.
 *
 * A-84 — a **retired** batch is history and is never summed.
 */
export interface RangeReport {
  from: string;
  to: string;
  createdAt: string;
  /** d27 — printed, because a range containing a day nobody closed is short. */
  batchCount: number;
  /**
   * A-83 — batches inside the range whose stored summary predates the current
   * shape, so they cannot answer for every section. Printed beside the batch
   * count and **never zero-filled**: a zero a reader cannot tell from an
   * absence is the invented number A-81 exists to keep off a report.
   */
  shortBatchCount: number;
  start: string | null;
  end: string | null;
  bySection: SectionSalesRow[];
  salesFooter: SalesFooter;
  byTaxLine: TaxLineRow[];
  byTender: TenderRowFigures[];
  undepositedTotal: number | null;
  cashNet: number | null;
  byCustomerType: CustomerTypeRow[];
  /** d27 — an average per HOUR OF THE DAY, so a month is 24 rows at most. */
  perHourOfDay: (HourRow & { days: number })[];
  byEmployee: EmployeeRow[];
}

/** A stored summary, read back. `undefined` where the batch stored none. */
const summaryOf = (b: CloseBatch): DayBreakdown | undefined =>
  b.summary as unknown as DayBreakdown | undefined;

const sumBy = <T, K extends string>(
  rows: T[],
  key: (r: T) => K,
  merge: (into: T, from: T) => void,
): T[] => {
  const out = new Map<K, T>();
  for (const r of rows) {
    const k = key(r);
    const existing = out.get(k);
    if (!existing) out.set(k, { ...r });
    else merge(existing, r);
  }
  return [...out.values()];
};

/**
 * `from` and `to` are inclusive calendar dates (`YYYY-MM-DD`), matched against
 * the batch's own `at`. M-07 d19 makes a business day a calendar day ending at
 * midnight, and this inherits that rather than inventing a second boundary.
 */
export function computeRangeReport(
  batches: CloseBatch[],
  from: string,
  to: string,
  createdAt: string,
): RangeReport {
  // A-84 — live batches only. A retired one keeps its summary as history and
  // nothing sums it, which is the whole point of retiring rather than
  // rewriting: an undone close leaves the range's figures where they were.
  const inRange = batches
    .filter((b) => !b.undoneAt)
    .filter((b) => {
      const day = b.at.slice(0, 10);
      return day >= from && day <= to;
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  const summaries = inRange.map(summaryOf).filter((s): s is DayBreakdown => !!s);
  // A-83 — a batch that stored nothing, or stored an older shape, cannot answer
  // for every section. Counted and printed; never filled in with zeros.
  const shortBatchCount = inRange.filter(
    (b) => (b.summaryVersion ?? 0) < SUMMARY_SCHEMA_VERSION,
  ).length;

  const footer: SalesFooter = {
    items: 0,
    retail: 0,
    discount: 0,
    net: 0,
    transactions: 0,
    discountPctOfSales: null,
    averageSale: null,
  };
  for (const s of summaries) {
    footer.items += s.salesFooter.items;
    footer.retail = round2(footer.retail + s.salesFooter.retail);
    footer.discount = round2(footer.discount + s.salesFooter.discount);
    footer.net = round2(footer.net + s.salesFooter.net);
    footer.transactions += s.salesFooter.transactions;
  }
  footer.discountPctOfSales = footer.retail !== 0 ? round2((footer.discount / footer.retail) * 100) : null;
  footer.averageSale = footer.transactions > 0 ? round2(footer.net / footer.transactions) : null;

  // d27 — an average per hour OF THE DAY. `days` is how many of the summed
  // batches contributed to that hour, so the figure is an average over the
  // days the shop actually traded in it rather than over the calendar.
  const hourDays = new Map<number, number>();
  for (const s of summaries) for (const h of s.perHour) hourDays.set(h.hour, (hourDays.get(h.hour) ?? 0) + 1);

  const perHourOfDay = sumBy(
    summaries.flatMap((s) => s.perHour),
    (r) => String(r.hour) as `${number}`,
    (into, from_) => {
      into.transactions += from_.transactions;
      into.value = round2(into.value + from_.value);
      into.voids += from_.voids;
    },
  )
    .map((r) => {
      const days = hourDays.get(r.hour) ?? 1;
      return {
        ...r,
        days,
        transactions: round2(r.transactions / days),
        value: round2(r.value / days),
        voids: round2(r.voids / days),
      };
    })
    .sort((a, b) => a.hour - b.hour);

  const starts = summaries.map((s) => s.fileInfo.start).filter((x): x is string => !!x).sort();
  const ends = summaries.map((s) => s.fileInfo.end).filter((x): x is string => !!x).sort();

  return {
    from,
    to,
    createdAt,
    batchCount: inRange.length,
    shortBatchCount,
    start: starts[0] ?? null,
    end: ends[ends.length - 1] ?? null,
    bySection: sumBy(
      summaries.flatMap((s) => s.bySection),
      (r) => r.label as string,
      (into, from_) => {
        into.items += from_.items;
        into.retail = round2(into.retail + from_.retail);
        into.discount = round2(into.discount + from_.discount);
        into.net = round2(into.net + from_.net);
        into.amount = into.net;
      },
    ),
    salesFooter: footer,
    byTaxLine: sumBy(
      summaries.flatMap((s) => s.byTaxLine),
      (r) => r.name as string,
      (into, from_) => {
        into.count += from_.count;
        into.base = round2(into.base + from_.base);
        into.amount = round2(into.amount + from_.amount);
      },
    ),
    byTender: sumBy(
      summaries.flatMap((s) => s.byTender),
      (r) => r.label as string,
      (into, from_) => {
        into.count += from_.count;
        into.amount = round2(into.amount + from_.amount);
      },
    ),
    undepositedTotal: summaries.some((s) => s.undepositedTotal !== null)
      ? round2(summaries.reduce((n, s) => n + (s.undepositedTotal ?? 0), 0))
      : null,
    cashNet: summaries.some((s) => s.cashNet !== null)
      ? round2(summaries.reduce((n, s) => n + (s.cashNet ?? 0), 0))
      : null,
    perHourOfDay,
    // d17 — the same fixed order the close prints, so a quiet month and a busy
    // one read alike. `sumBy` preserves first-seen order across batches, which
    // makes the order depend on which day happened to sell to whom.
    byCustomerType: orderCustomerTypes(sumBy(
      summaries.flatMap((s) => s.byCustomerType),
      (r) => r.label as string,
      (into, from_) => {
        into.transactions += from_.transactions;
        into.items += from_.items;
        into.retail = round2(into.retail + from_.retail);
        into.discount = round2(into.discount + from_.discount);
        into.net = round2(into.net + from_.net);
      },
    )),
    byEmployee: sumBy(
      summaries.flatMap((s) => s.byEmployee),
      (r) => r.employee as string,
      (into, from_) => {
        into.transactions += from_.transactions;
        into.items += from_.items;
        into.value = round2(into.value + from_.value);
        into.returns += from_.returns;
        into.returnsValue = round2(into.returnsValue + from_.returnsValue);
        into.voids += from_.voids;
        // d24 — a rate, so the sum of two rates is not the rate. Averaged over
        // the batches that HAVE one, rather than over all of them: an Employee
        // who discounted nothing on Tuesday must not drag Monday's figure
        // toward zero, which is the same argument d24 makes for dividing by
        // items discounted rather than by all items.
        const both = [into.avgDiscount, from_.avgDiscount].filter((x): x is number => x !== null);
        into.avgDiscount = both.length ? round2(both.reduce((a, b) => a + b, 0) / both.length) : null;
      },
    ).sort((a, b) => a.employee.localeCompare(b.employee)),
  };
}

/** The three ranges the shop actually asks for, as d27 names them. */
export function presetRange(preset: "this-month" | "last-month" | "ytd", today: Date): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const y = today.getFullYear();
  const m = today.getMonth();
  if (preset === "this-month") return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(today) };
  if (preset === "last-month") {
    return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
  }
  return { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(today) };
}
