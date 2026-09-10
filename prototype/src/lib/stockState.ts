import type { InventoryItem, PendingOrderLine, RecordEntry, Sale } from "../data/types";
import { availableOnHand, heldCount, onHand } from "./totals";

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
}

interface StockInput {
  inventory: InventoryItem[];
  pendingOrders: PendingOrderLine[];
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
  // "On the way" means PLACED, not merely raised. M-02 splits a pending line's
  // life in two: raised into a supplier stream (no poNumber) is still Order
  // Processing's job and nobody has told the supplier anything; placed
  // (poNumber set) is a real order. Counting raised lines here would have an
  // employee telling a customer their record is on its way when no order
  // exists — so only placed lines count, and raised ones are reported
  // separately.
  const forRecord = input.pendingOrders.filter((o) => o.recordId === record.id);
  const onOrder = forRecord.filter((o) => o.poNumber).reduce((sum, o) => sum + o.qty, 0);
  const raised = forRecord.filter((o) => !o.poNumber).reduce((sum, o) => sum + o.qty, 0);

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
  if (total > 0) state = "here";
  else if (onOrder > 0) state = "coming";
  else if (record.catalogOnly) state = "never";
  else if (everSold > 0 || input.inventory.some((i) => i.recordId === record.id)) state = "before";
  else state = "never";

  return { state, onHand: total, available, held, onOrder, raised, lastSoldAt, everSold };
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

/** The bold half of a result row's right-hand stamp. */
export function stampLead(facts: StockFacts): string {
  switch (facts.state) {
    case "here":
      return `${facts.available} here`;
    case "coming":
      return `${facts.onOrder} coming`;
    case "before":
      return "had before";
    case "never":
      return "never stocked";
  }
}

/** The quiet half — recency, or why there is none. */
export function stampAgo(facts: StockFacts): string | undefined {
  const ago = agoLabel(facts.lastSoldAt);
  if (facts.state === "never") return undefined;
  if (facts.state === "coming") return "on order";
  if (!ago) return facts.state === "before" ? "no sales recorded" : undefined;
  return `sold ${ago}`;
}
