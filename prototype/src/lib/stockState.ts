import { outstandingQty } from "./orderLines";
import type {
  InventoryItem,
  Invoice,
  PendingOrderLine,
  RecordEntry,
  Sale,
} from "../data/types";
import { lineForItem } from "./provenance";
import { availableOnHand, copiesPresent, heldCount, onHand } from "./totals";

// ---- Stock state (E-03) ----
//
// E-03 says search covers stock on hand, stock on order, catalog Records with
// no stock, and titles we have held before. It does not say how an employee is
// meant to tell those apart at a glance, and "do you have it?" is the question
// the screen exists to answer. These four states are that answer.
//
// Everything here is DERIVED from what the prototype already models — copies,
// pending order lines, and Sales. Nothing new is stored on a Record, which
// keeps "on hand is derived, not stored" (PRD §4.1) true of state as well as
// of counts.
export type StockState = "here" | "coming" | "before" | "never";

export const STOCK_STATES: StockState[] = ["here", "coming", "before", "never"];

export const STOCK_LABEL: Record<StockState, string> = {
  here: "Here now",
  coming: "On the way",
  before: "Had before",
  never: "Never stocked",
};

// The band heading used above a group of results.
export const STOCK_HEADING: Record<StockState, string> = {
  here: "On the floor now",
  coming: "On the way",
  before: "We have stocked before",
  never: "Never stocked",
};

export interface StockFacts {
  state: StockState;
  onHand: number;
  available: number;
  held: number;
  /** Units on a PLACED order line (poNumber set) — genuinely on the way. */
  onOrder: number;
  /** Units raised into a supplier stream but not yet placed (M-02 Phase 1-2). */
  raised: number;
  /** ISO-ish timestamp of the most recent completed sale of this Record. */
  lastSoldAt?: string;
  /** How many copies we have ever sold. */
  everSold: number;
  /**
   * E-03 d16 — days since the oldest copy we still hold was received, read
   * through A-45's provenance reference to its Invoice. `undefined` when no
   * present copy has an Invoice behind it: no arrival date is an honest
   * answer, and better than a guessed one.
   */
  heldSinceDays?: number;
}

interface StockInput {
  inventory: InventoryItem[];
  pendingOrders: PendingOrderLine[];
  /** Needed to derive what is still outstanding on a PO line (E-02 d30). */
  invoices: Invoice[];
  sales: Sale[];
}

// A Sale counts as history once it has been tendered — Open sales are still
// being rung up and Void ones did not happen (E-05 sale states). A Return is
// a negative-quantity line on a Sale, so it is excluded from "sold" too.
const isCompletedSale = (s: Sale): boolean =>
  (s.state === "Current" || s.state === "Closed") && !s.isReturn;

export function stockFacts(record: RecordEntry, input: StockInput): StockFacts {
  const held = heldCount(record.id, input.inventory);
  const available = availableOnHand(record.id, input.inventory);
  const total = onHand(record.id, input.inventory);
  // Banding asks a different question from the figure. "Here now" means there
  // is a copy to put in someone's hands, so it reads the copies PRESENT — a
  // Record with one on the shelf and three oversold is still on the shelf,
  // even though §5.1 puts its on-hand at -2. Reading `total` here would send
  // a customer away from a record we are holding.
  const present = copiesPresent(record.id, input.inventory);

  // d16 — how long the oldest copy we still hold has been here. A copy knows
  // the InvoiceLine it was minted from (A-45), and the Invoice knows when it
  // was received; nothing on the item itself records an arrival date.
  let heldSinceDays: number | undefined;
  const receivedDates = input.inventory
    .filter((i) => i.recordId === record.id && (i.status === "sellable" || i.status === "held"))
    .map((i) => lineForItem(i, input.invoices)?.invoice.receivedDate)
    .filter((d): d is string => !!d)
    .sort();
  if (receivedDates.length > 0) {
    const oldest = new Date(receivedDates[0] + "T00:00:00").getTime();
    heldSinceDays = Math.max(0, Math.floor((Date.now() - oldest) / 86_400_000));
  }
  // "On the way" means PLACED, not merely raised. M-02 splits a pending line's
  // life in two: raised into a supplier stream (no poNumber) is still Order
  // Processing's job and nobody has told the supplier anything; placed
  // (poNumber set) is a real order. Counting raised lines here would have an
  // employee telling a customer their record is on its way when no order
  // exists — so only placed lines count, and raised ones are reported
  // separately.
  //
  // A line survives being received now (M-02 d21), so existence no longer
  // means "still coming" — these count the OUTSTANDING quantity, and a
  // Cancelled line counts for nothing. Reading the row's own qty here would
  // tell a customer their record is on the way after it had already landed
  // and sold.
  const forRecord = input.pendingOrders.filter((o) => o.recordId === record.id);
  const outstanding = (o: PendingOrderLine) => outstandingQty(o, input.invoices);
  const open = forRecord.filter((o) => o.status !== "Cancelled");
  const onOrder = open.filter((o) => o.poNumber).reduce((sum, o) => sum + outstanding(o), 0);
  const raised = open.filter((o) => !o.poNumber).reduce((sum, o) => sum + outstanding(o), 0);

  let everSold = 0;
  let lastSoldAt: string | undefined;
  for (const sale of input.sales) {
    if (!isCompletedSale(sale)) continue;
    for (const line of sale.lines) {
      if (line.recordId !== record.id || line.qty <= 0) continue;
      everSold += line.qty;
      if (!lastSoldAt || sale.createdAt > lastSoldAt) lastSoldAt = sale.createdAt;
    }
  }

  // Precedence is deliberate and matches how the question gets asked at the
  // counter: what can I sell you right now, then what is coming, then have we
  // ever had it. A Record that is both on the shelf and on order reads as
  // "here" — the stamp still says how many are coming.
  let state: StockState;
  if (present > 0) state = "here";
  else if (onOrder > 0) state = "coming";
  // E-03 d17 — *never stocked* is derived from holding no copies and
  // having no history, NOT from being a catalog-only match. A Record adopted
  // deliberately and never ordered is never stocked while having nothing to
  // do with the provider; a provider match is not a Record at all (d18), so
  // it never reaches this function.
  else if (everSold > 0 || input.inventory.some((i) => i.recordId === record.id)) state = "before";
  else state = "never";

  return { state, onHand: total, available, held, onOrder, raised, lastSoldAt, everSold, heldSinceDays };
}

// Sort key so results group by state in the order above — E-03 decision 4
// already wants stock we hold first; this extends the same idea to the rest.
export const stockRank = (state: StockState): number => STOCK_STATES.indexOf(state);

/**
 * "6 days ago", "3 weeks ago", "Mar 2024" — deliberately coarse. The point of
 * the stamp is recency, not a date: an employee needs to know whether this is
 * a title that moves or one that sat.
 */
export function agoLabel(iso: string | undefined, now: Date = new Date()): string | undefined {
  if (!iso) return undefined;
  const then = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(then.getTime())) return undefined;
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days < 0) return undefined;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 21) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return then.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * E-03 d16 — how long a held Record may sit, never having sold, before the
 * stamp says so. A store setting (M-06); this is its default. Silence before
 * the threshold is deliberate: new stock has no recency to report, and a flag
 * that fires on every arrival is noise.
 */
export const DEAD_STOCK_DAYS = 180;

/**
 * The recency half of a result row's stamp — E-03 d12, d16. The count half is
 * `countFor` in FindSlab, which says more than the `stampLead` that used to
 * live here: available / all held / on order / pending rather than one figure.
 * That helper is gone rather than left exported and unused.
 *
 * TWO CLOCKS feed this one string and they are not comparable — time since the
 * last sale for a Record that has sold, time since arrival for one that never
 * has. d16 accepts that knowingly, on condition the words say which: "sold 6mo
 * ago" against "never sold".
 */
export function stampAgo(facts: StockFacts): string | undefined {
  const ago = agoLabel(facts.lastSoldAt);
  if (facts.state === "never") return undefined;
  if (facts.state === "coming") return "on order";
  if (!ago) {
    if (facts.state === "before") return "no sales recorded";
    // d16 — held, never sold. Silent until it has sat past the threshold,
    // then the loudest reorder signal there is: we bought it, nobody wanted
    // it. `heldSinceDays` is undefined when no present copy has an Invoice
    // behind it, and no arrival date means no stamp rather than a guess.
    if (facts.heldSinceDays !== undefined && facts.heldSinceDays >= DEAD_STOCK_DAYS) return "never sold";
    return undefined;
  }
  return `sold ${ago}`;
}
