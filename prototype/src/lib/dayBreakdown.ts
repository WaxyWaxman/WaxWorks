import type {
  Customer,
  GLAccount,
  GLMapping,
  Genre,
  InventoryItem,
  RecordEntry,
  Sale,
  SectionRow,
  TenderRow,
} from "../data/types";
import { seamAccount } from "./journal";
import { tenderRowFor } from "./closeJournal";
import { sectionRowFor } from "./taxonomy";
import { lineGross, lineNet, lineTaxComponents, onHand, round2, type TaxContext } from "./totals";

// M-03 — the same breakdown backs both View Subtotal (read-only) and Total
// Today's Sales (which also closes the batch). Sales/tender/tax/section
// figures are scoped to Sales currently in "Current" state — exactly what's
// about to be closed.
//
// d17 — the report is EIGHT NAMED SECTIONS in a fixed order, and the order is
// the argument: provenance, then the money in the order it is asked about,
// then the counter. This module computes all eight; `TillFunctions` renders
// them and decides what folds (d28).

/**
 * d17, A-83 — the shape of a stored summary, stamped onto the CloseBatch at
 * close so a later reader keys on **a fact the close wrote** rather than on
 * which keys happen to be present (A-43).
 *
 * Bump this whenever a section is added or a section's figures change. A range
 * report reads it to know whether a batch can answer for a section at all, and
 * prints the count of batches that cannot rather than zero-filling them
 * (A-83): a zero nobody can tell from an absence is the invented number A-81
 * exists to keep off a report.
 */
export const SUMMARY_SCHEMA_VERSION = 2;

/** One row of §2 *Sales*, §5 *by customer type*, and the footer under each. */
export interface SalesFigures {
  /** Net of matched Returns — d19 nets a Return into its own Section. */
  items: number;
  /** Pre-discount extended price, so `discount` below is a real subtraction. */
  retail: number;
  discount: number;
  /** `retail − discount`. */
  net: number;
}

export interface SectionSalesRow extends SalesFigures {
  /** M-06 d28's two-character code — what a narrow column can print. */
  code: string;
  label: string;
  /** Kept so the pre-d19 callers and tests reading `.amount` still resolve. */
  amount: number;
}

export interface SalesFooter extends SalesFigures {
  transactions: number;
  /**
   * d19 — the one number that says whether the counter is giving the shop
   * away. Discount over **retail**: what would have been charged.
   * `null` where nothing was sold, rather than `0%` over a zero denominator.
   */
  discountPctOfSales: number | null;
  /** `net ÷ transactions`. A `$0.00` counter buy counts as a transaction. */
  averageSale: number | null;
}

export interface TaxLineRow {
  /** Carries the rate where d15 splits a type across a rate change. */
  name: string;
  /** d20 — counted per Sale LINE, not per Sale. */
  count: number;
  ratePpm: number;
  /** d20 — the value the tax was charged on. A compound pair does NOT share one. */
  base: number;
  amount: number;
}

export interface TenderRowFigures {
  label: string;
  /** d21 — the GL account this tender posts to (M-07 d21, d26). */
  account?: string;
  /** Distinct transactions that used it. */
  count: number;
  amount: number;
  /** True where the account is `undeposited` — what the bank has not paid out. */
  undeposited: boolean;
}

export interface CustomerTypeRow extends SalesFigures {
  /** Regular · Staff · Business · Walk-in (d22). */
  label: string;
  transactions: number;
}

export interface HourRow {
  /** 0–23, the hour of the TENDER (d23, A-73). */
  hour: number;
  transactions: number;
  value: number;
  /** d26 — counted, never valued. */
  voids: number;
}

export interface EmployeeRow {
  employee: string;
  transactions: number;
  items: number;
  value: number;
  /**
   * d24 — total discount over the ITEMS DISCOUNTED, not over all items.
   * A rate, so it is comparable between a busy Employee and a quiet one.
   * `null` where they discounted nothing.
   */
  avgDiscount: number | null;
  returns: number;
  returnsValue: number;
  voids: number;
}

export interface TenderingDetailRow {
  employee: string;
  saleNumber: string;
  /** d25 — `Walk-in` where the Sale carries no Customer (E-05 d30). */
  customer: string;
  amount: number;
}

export interface DayBreakdown {
  /** A-83 — stamped so a range report never has to guess what this can answer. */
  schemaVersion: number;
  /** §1 File info (d18) — bounds the BATCH, never the calendar day. */
  fileInfo: {
    /** Tender timestamp of the earliest record in scope; null when empty. */
    start: string | null;
    end: string | null;
    /** When this report was generated — the one of the three that moves. */
    createdAt: string;
  };
  transactionCount: number;
  grossSales: number;
  returnsAmount: number; // negative
  netSales: number;
  /** §2 Sales (d19). */
  bySection: SectionSalesRow[];
  salesFooter: SalesFooter;
  /** §3 Taxes (d20), split by rate within type where d15 applies. */
  byTaxLine: TaxLineRow[];
  // Labelled rather than keyed by type, because Account Balance moves both
  // ways and netting a day's top-ups against its draw-downs under one row
  // reports $0 for two real movements (M-03 d14).
  /** §4 Tenders/Misc (d21). */
  byTender: TenderRowFigures[];
  /**
   * d21 — the total over the tenders posting to **undeposited funds**: cash
   * and card, the money on its way to the bank.
   *
   * **Not a bank total.** M-07 d21 lands cash and card in undeposited funds
   * and money reaches a bank account only through a BankDeposit (A-66), so a
   * figure called *bank* here would read as a balance the bank already agrees
   * with. `null` where nothing posted there at all.
   */
  undepositedTotal: number | null;
  /**
   * The day's cash movement, net of what left the drawer — M-03 d16.
   *
   * `null` where nothing cash-shaped happened at all, so the tape carries no
   * line rather than a misleading `$0.00`.
   *
   * **A subtotal, not a movement**, which is why it is its own field and not a
   * row in `byTender`: anything summing that list would double-count it. d14's
   * rule that the tender column reports every movement rather than a net figure
   * is unaffected — both movements are still there, and this is read beside
   * them.
   */
  cashNet: number | null;
  /** §5 Sales by customer type (d22). */
  byCustomerType: CustomerTypeRow[];
  /** §6 Sales per hour (d23) — an hour with nothing in it carries no row. */
  perHour: HourRow[];
  /** §7 Sales by Employee (d24). Readable by any Employee — architecture §11. */
  byEmployee: EmployeeRow[];
  /** §8 Tendering details (d25) — the only section that is a listing. */
  tenderingDetails: { label: string; rows: TenderingDetailRow[] }[];
  // Money that came through a tender without being a sale, so the tender
  // column can be reconciled against net sales instead of silently
  // disagreeing with it (M-03 d14).
  giftCardsLoaded: number;
  /**
   * E-06 d26 — returns that took in a disc the shop has no sold record for.
   * Money that left the till and is NOT a reduction of revenue: d26 books such
   * a copy at the refund paid and treats that money as a **purchase**, since
   * there is no sale to reverse. Reported on its own for the reason M-03 d14
   * gives a gift-card load — kept out of gross and out of Section, and named,
   * so the tender column can still be reconciled against net sales instead of
   * silently exceeding it.
   */
  unmatchedReturns: number;
  voidCount: number;
  holdsCreatedCount: number;
  holdsCancelledCount: number;
  payouts: { saleLabel: string; note: string; amount: number }[];
  belowMin: { recordId: string; label: string; onHand: number; minOnHand: number }[];
}

// The two labels the cash subtotal is built from. Named rather than typed
// inline because the subtotal and the rows have to agree, and a typo in one of
// them would silently drop a movement out of the total.
const CASH = "Cash";
const CASH_PAYOUTS = "Cash — pay-outs";

/** d22, d25, E-05 d30 — one word for a Sale with no Customer, everywhere. */
export const WALK_IN = "Walk-in";

/** The order §5 prints, so a quiet day and a busy one read the same way. */
const CUSTOMER_TYPES = ["Regular", "Staff", "Business", WALK_IN] as const;

const emptyFigures = (): SalesFigures => ({ items: 0, retail: 0, discount: 0, net: 0 });

const addFigures = (into: SalesFigures, items: number, retail: number, net: number): void => {
  into.items += items;
  into.retail = round2(into.retail + retail);
  into.discount = round2(into.discount + (retail - net));
  into.net = round2(into.net + net);
};

/**
 * d23, A-73 — the hour of the TENDER, which is the moment the money moved and
 * the timestamp A-57 already resolves tax at. Seeded Sales predate
 * `tenderedAt`, so `createdAt` is the fallback rather than dropping the row.
 */
const momentOf = (sale: Sale): string => sale.tenderedAt ?? sale.createdAt;

/**
 * Optional inputs the eight sections need and the six blocks before them did
 * not. An object rather than six more positional parameters, and every field
 * optional so a caller that has none still gets a well-formed report:
 * no `customers` reports everything as **Walk-in**, which is what a report
 * with no customer list should say, and no chart leaves the account column
 * blank rather than inventing a name for it.
 */
export interface BreakdownExtras {
  customers?: Customer[];
  tenderRows?: TenderRow[];
  accounts?: GLAccount[];
  mappings?: GLMapping[];
  /** d18 — passed in rather than read from the clock, so this stays pure. */
  createdAt?: string;
  /**
   * The close this report is bounded by, used only to scope the void count.
   *
   * **This is the one place the code has taken a position the decision table
   * has not.** M-03's Requirements need a void attributable to *a batch* and
   * to *an Employee*, and [architecture](../../../docs/architecture.md) §11
   * records that §2 settles neither: A-19 attributes a **tender** to the lock
   * holder, and a void is a later act by whoever is standing there. So a
   * voided Sale carries no batch and no separate actor, and the honest
   * approximation available here is **its own `createdAt` against the last
   * close** — system-written facts only, never the log's prose, which E-04
   * d25 refuses. It is wrong for a Sale rung before a close and voided after
   * it. Left visible rather than hidden because the fix is a decision, not a
   * line of code.
   */
  sinceClosedAt?: string;
}

export function computeDayBreakdown(
  sales: Sale[],
  records: RecordEntry[],
  taxCtx: TaxContext,
  inventory: InventoryItem[],
  // M-06 d31 — a Record's Section is derived through its genre's required
  // parent, so the breakdown needs the taxonomy rather than a field.
  genres: Genre[],
  sections: SectionRow[],
  extras: BreakdownExtras = {},
): DayBreakdown {
  // Returns belong in the close (M-03 d7, E-06 d8): a Return is a Current
  // transaction like any other, and excluding the document meant a $50 cash
  // refund never reached the tender column — the drawer was $50 lighter than
  // the report said, and net sales were overstated by the same amount. The
  // gross/returns split below is by line SIGN, not by document, so counting
  // the document keeps refunds out of gross while putting them where the
  // spec's own worked example says they go.
  const current = sales.filter((s) => s.state === "Current");
  const recordFor = (id?: string) => records.find((r) => r.id === id);
  const customerFor = (id?: string) => extras.customers?.find((c) => c.id === id);

  let grossSales = 0;
  let returnsAmount = 0;
  let giftCardsLoaded = 0;
  let unmatchedReturns = 0;
  const sectionRows = new Map<string, SectionSalesRow>();
  const taxRows = new Map<string, TaxLineRow>();
  const footer: SalesFigures = emptyFigures();
  const customerTypes = new Map<string, CustomerTypeRow>();
  const employees = new Map<string, EmployeeRow>();

  const employeeRow = (name: string): EmployeeRow => {
    let row = employees.get(name);
    if (!row) {
      row = { employee: name, transactions: 0, items: 0, value: 0, avgDiscount: null, returns: 0, returnsValue: 0, voids: 0 };
      employees.set(name, row);
    }
    return row;
  };
  // d24 — the average is over the items that actually took a discount, so a
  // quiet shift cannot dilute it. Accumulated separately from the row.
  const discountTally = new Map<string, { total: number; items: number }>();

  for (const sale of current) {
    // E-05 d23 — a Sale attributes to whoever held the lock at TENDER, which
    // `sale_tender` has already written onto `createdBy`. Nothing here
    // re-derives it; the field is the answer.
    const who = sale.createdBy || "—";
    const staff = employeeRow(who);
    staff.transactions += 1;

    const typeLabel = customerFor(sale.customerId)?.accountType ?? WALK_IN;
    let ct = customerTypes.get(typeLabel);
    if (!ct) {
      ct = { label: typeLabel, transactions: 0, ...emptyFigures() };
      customerTypes.set(typeLabel, ct);
    }
    ct.transactions += 1;

    for (const l of sale.lines) {
      // Loading a gift card is money in, but it is not a sale — it is a
      // liability the store now owes (M-05 d10). Kept out of gross and out
      // of Section, and reported on its own so the tender column adds up.
      if (l.kind === "giftcard-load") {
        giftCardsLoaded = round2(giftCardsLoaded + l.qty * l.price);
        continue;
      }
      if (l.kind !== "item" && l.kind !== "nontracked") continue;
      const net = round2(lineNet(l));
      const retail = round2(lineGross(l));
      if (l.qty >= 0) grossSales += net;
      // d26 — an unmatched return is a purchase, not a reversal, so it reduces
      // neither gross nor net. Same shape as the gift-card load above: out of
      // gross, out of Section, and named rather than absorbed.
      else if (l.unmatchedReturn) unmatchedReturns = round2(unmatchedReturns + net);
      else returnsAmount += net;

      // d24 — returns are counted against whoever TOOK them, which is where a
      // returns pattern is read. Section rows decline to column them (d19).
      if (l.qty < 0 && !l.unmatchedReturn) {
        staff.returns += Math.abs(l.qty);
        staff.returnsValue = round2(staff.returnsValue + net);
      }

      // d17, d31 — every sellable thing carries a genre, so both kinds of
      // line resolve the same way and there is no generic bucket left: an
      // item line through its Record, a non-tracked line through the genre
      // on the line itself. A genre that resolves to no Section buckets
      // under the em dash rather than being filed somewhere plausible, so a
      // taxonomy gap stays visible in the one report that would hide it.
      const genreId = l.kind === "item" ? recordFor(l.recordId)?.genreId : l.genreId;
      const section = sectionRowFor(genres, sections, genreId);
      // d20 — whether a Section enters revenue reporting is a property of
      // the Section, not a special case hard-coded for gift cards. Off keeps
      // it out of *By Section* entirely.
      // d26 — out of Section as well as out of gross, for the reason M-03 d14
      // keeps a gift-card load out of both: it is money that moved without
      // being a sale, and filing it under a Section would overstate that
      // Section's takings. The TAX below is deliberately still counted — the
      // money really did leave the till — and whether an unmatched Return
      // should carry tax at all is an open question d26 did not settle.
      if (!l.unmatchedReturn && section?.countsAsRevenue !== false) {
        const label = section?.name ?? "—";
        let row = sectionRows.get(label);
        if (!row) {
          row = { code: section?.code ?? "—", label, amount: 0, ...emptyFigures() };
          sectionRows.set(label, row);
        }
        // d19 — a matched Return NETS INTO ITS OWN SECTION: a returned VINYL
        // copy reduces VINYL. That is what makes the section rows sum to net
        // sales rather than to something that needs explaining.
        addFigures(row, l.qty, retail, net);
        row.amount = row.net;
        addFigures(footer, l.qty, retail, net);
        addFigures(ct, l.qty, retail, net);
        staff.items += l.qty;
        staff.value = round2(staff.value + net);
        if (l.discountPct > 0) {
          const tally = discountTally.get(who) ?? { total: 0, items: 0 };
          tally.total = round2(tally.total + (retail - net));
          tally.items += Math.abs(l.qty);
          discountTally.set(who, tally);
        }
      }
      // M-03 d13 reports per tax TYPE, and d15 splits by RATE where a period
      // spans a change — so the key is both. A normal period has one rate per
      // type and reads exactly as it did; the split appears only when more
      // than one rate actually contributed, which is the day it matters.
      for (const c of lineTaxComponents(l, taxCtx)) {
        if (c.amount === 0 && !c.ratePpm) continue;
        const label = c.ratePpm === 0 ? `${c.name} (0%)` : `${c.name} (${c.ratePpm / 10000}%)`;
        let row = taxRows.get(label);
        if (!row) {
          row = { name: label, count: 0, ratePpm: c.ratePpm, base: 0, amount: 0 };
          taxRows.set(label, row);
        }
        // d20 — counted per Sale LINE, because the count exists to be read
        // against the base and a per-Sale count could not be.
        row.count += 1;
        // d20 — each tax line carries ITS OWN base. Under M-06 d16's `ab+`,
        // `b` is charged on subtotal plus `a`, so `b`'s base exceeds `a`'s by
        // exactly `a` — and the two are remitted to different authorities, so
        // one shared base would misstate one of them. `base` is written by
        // `resolveLineTax`; the division is the fallback for a snapshot taken
        // before the field existed, and is exact to the cent either way.
        const base = c.base ?? (c.ratePpm > 0 ? round2(c.amount / (c.ratePpm / 1_000_000)) : net);
        row.base = round2(row.base + base);
        row.amount = round2(row.amount + c.amount);
      }
    }
  }

  const tenderAmounts = new Map<string, { amount: number; count: number; account?: string; undeposited: boolean }>();
  const details = new Map<string, TenderingDetailRow[]>();
  const payouts: DayBreakdown["payouts"] = [];
  for (const sale of current) {
    for (const t of sale.tenders) {
      // Account Balance is the one tender that runs both directions — a
      // customer paying onto their account and a customer spending the
      // credit are opposite movements that happen to share a type. Reported
      // separately so a day that did $100 of each doesn't read as $0.
      //
      // A PAY-OUT is reported against CASH (M-03 d16), because that is the
      // tender it moved through: the section above says returns and pay-outs
      // appear as negative amounts *against the tender they moved through*,
      // and E-05 d16 says it plainly — "a negative cash line in the M-03
      // close". Under its own `Pay-out` label, a day with no cash sales
      // carried no cash line at all, and the $20 that left the drawer read as
      // a category of its own rather than as cash going out. A cash refund was
      // already right: it is a negative `Cash` tender and always netted here.
      const label =
        t.type === "Pay-out"
          ? CASH_PAYOUTS
          : t.type === "Account Balance"
            ? `Account Balance (${t.accountDirection === "add" ? "added" : "drawn"})`
            : t.type;
      // d21 — the account is M-07 d21's, resolved through the configured row
      // exactly as the close's own journal resolves it, so the report and the
      // journal can never name two different accounts for one tender.
      const row = extras.tenderRows ? tenderRowFor(t, extras.tenderRows) : undefined;
      const acct =
        row && extras.accounts && extras.mappings
          ? seamAccount(extras.accounts, extras.mappings, "tender", row.id)
          : undefined;
      const entry = tenderAmounts.get(label) ?? {
        amount: 0,
        count: 0,
        account: acct?.name,
        undeposited: acct?.role === "undeposited",
      };
      entry.amount = round2(entry.amount + t.amount);
      entry.count += 1;
      tenderAmounts.set(label, entry);

      // d25 — grouped by TENDER rather than by Sale, so a split tender appears
      // once per tender and each group sums to its own total above. Both lines
      // carry the same transaction number, which is correct: neither is a Sale
      // total.
      const list = details.get(label) ?? [];
      list.push({
        employee: sale.createdBy || "—",
        saleNumber: sale.saleNumber ? `#${sale.saleNumber}` : "—",
        customer: customerFor(sale.customerId)?.name ?? WALK_IN,
        amount: t.amount,
      });
      details.set(label, list);

      if (t.type === "Pay-out") {
        payouts.push({ saleLabel: sale.saleNumber ? `#${sale.saleNumber}` : "—", note: t.note ?? "", amount: t.amount });
      }
    }
  }

  // holdRef persists on a Sale even after it tenders out of Held, so a later
  // Void of an already-tendered ex-hold Sale isn't a "hold cancelled" — the
  // log's own wording (cancelHold vs. voidSale) is the reliable signal.
  const wasHoldCancel = (s: Sale) => s.log.some((e) => e.text.startsWith("Hold cancelled"));
  // See `BreakdownExtras.sinceClosedAt` — the void's period is an open
  // question, and this is the honest approximation, not an answer to it.
  const inPeriod = (s: Sale) => !extras.sinceClosedAt || s.createdAt > extras.sinceClosedAt;
  const voided = sales.filter((s) => s.state === "Void" && !wasHoldCancel(s) && inPeriod(s));
  const voidCount = voided.length;
  const holdsCreatedCount = sales.filter((s) => !!s.holdRef).length;
  const holdsCancelledCount = sales.filter((s) => s.state === "Void" && wasHoldCancel(s)).length;
  // d26 — a void is counted against whoever is attributed the Sale and never
  // valued. Every candidate figure is a number about a transaction that
  // deliberately did not happen.
  for (const v of voided) employeeRow(v.createdBy || "—").voids += 1;

  for (const [name, tally] of discountTally) {
    const row = employees.get(name);
    if (row && tally.items > 0) row.avgDiscount = round2(tally.total / tally.items);
  }

  // d23 — keyed on the tender moment, and an hour with nothing in it carries
  // no line at all: a shop open 11–6 prints seven rows, not twenty-four.
  const hours = new Map<number, HourRow>();
  const hourRow = (h: number): HourRow => {
    let row = hours.get(h);
    if (!row) {
      row = { hour: h, transactions: 0, value: 0, voids: 0 };
      hours.set(h, row);
    }
    return row;
  };
  for (const sale of current) {
    const h = new Date(momentOf(sale)).getHours();
    if (Number.isNaN(h)) continue;
    const row = hourRow(h);
    row.transactions += 1;
    for (const l of sale.lines) {
      if (l.kind !== "item" && l.kind !== "nontracked") continue;
      if (l.unmatchedReturn) continue;
      row.value = round2(row.value + round2(lineNet(l)));
    }
  }
  for (const v of voided) {
    const h = new Date(momentOf(v)).getHours();
    if (!Number.isNaN(h)) hourRow(h).voids += 1;
  }

  const moments = current.map(momentOf).filter(Boolean).sort();

  const belowMin = records
    .filter((r) => onHand(r.id, inventory) < r.minOnHand)
    .map((r) => ({ recordId: r.id, label: `${r.artist} — ${r.title}`, onHand: onHand(r.id, inventory), minOnHand: r.minOnHand }));

  const undeposited = [...tenderAmounts.entries()].filter(([, v]) => v.undeposited);

  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    fileInfo: {
      // d18 — the DATA's own bounds, not the period's: a batch opened at nine
      // whose first Sale is at noon starts at noon, and an empty batch has no
      // first record at all and reads as an em dash rather than as the
      // close's own timestamp.
      start: moments[0] ?? null,
      end: moments[moments.length - 1] ?? null,
      createdAt: extras.createdAt ?? new Date().toISOString(),
    },
    transactionCount: current.length,
    grossSales: round2(grossSales),
    returnsAmount: round2(returnsAmount),
    netSales: round2(grossSales + returnsAmount),
    bySection: [...sectionRows.values()],
    salesFooter: {
      ...footer,
      transactions: current.length,
      // Over RETAIL — what would have been charged. `null` rather than a
      // percentage of nothing on a day that sold nothing.
      discountPctOfSales: footer.retail !== 0 ? round2((footer.discount / footer.retail) * 100) : null,
      averageSale: current.length > 0 ? round2(footer.net / current.length) : null,
    },
    byTaxLine: [...taxRows.values()],
    byTender: [...tenderAmounts.entries()].map(([label, v]) => ({
      label,
      account: v.account,
      count: v.count,
      amount: v.amount,
      undeposited: v.undeposited,
    })),
    undepositedTotal:
      undeposited.length > 0 ? round2(undeposited.reduce((sum, [, v]) => sum + v.amount, 0)) : null,
    cashNet:
      tenderAmounts.has(CASH) || tenderAmounts.has(CASH_PAYOUTS)
        ? round2((tenderAmounts.get(CASH)?.amount ?? 0) + (tenderAmounts.get(CASH_PAYOUTS)?.amount ?? 0))
        : null,
    // Printed in a fixed order so a quiet day and a busy one read alike, and
    // a type nobody sold to carries no row.
    byCustomerType: CUSTOMER_TYPES.map((t) => customerTypes.get(t)).filter((r): r is CustomerTypeRow => !!r),
    perHour: [...hours.values()].sort((a, b) => a.hour - b.hour),
    byEmployee: [...employees.values()].sort((a, b) => a.employee.localeCompare(b.employee)),
    tenderingDetails: [...details.entries()].map(([label, rows]) => ({ label, rows })),
    giftCardsLoaded,
    unmatchedReturns: round2(unmatchedReturns),
    voidCount,
    holdsCreatedCount,
    holdsCancelledCount,
    payouts,
    belowMin,
  };
}
