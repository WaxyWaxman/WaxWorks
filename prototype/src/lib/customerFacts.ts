import { isClosedState, orderLineState, outstandingQty, type OrderLineState } from "./orderLines";
import type {
  Customer,
  Invoice,
  PendingOrderLine,
  RecordEntry,
  Sale,
  TaxLine,
} from "../data/types";
import { customerBalanceDelta, daysAgo, saleTotals } from "./totals";

// ---- Customer facts (E-07 d19) ----
//
// What the account track shows, all of it DERIVED from what the prototype
// already models — Sales, customer-attached order lines, and Invoices. Nothing
// new is stored on a Customer, which keeps decision 5 ("the balance is derived
// from movements, never entered directly") true of the rest of the track as
// well as of the balance.
//
// E-07 leaves open whether the standing figures are derived per view or
// maintained as running totals. Deriving them is the honest prototype answer:
// a stored total can disagree with the Sales it came from, and here nothing
// can.

/** A Held Sale in this Customer's name — the thing that goes stale silently. */
export interface HeldFact {
  saleId: string;
  holdRef: string;
  /** Every title on the hold; the track shows the first and counts the rest. */
  titles: string[];
  qty: number;
  /** Days since the hold was created. E-05 d7 tracks age; no threshold is applied. */
  days: number;
}

export interface OrderFact {
  line: PendingOrderLine;
  state: OrderLineState;
  title: string;
  outstanding: number;
}

export interface SaleFact {
  saleId: string;
  saleNumber: number;
  at: string;
  total: number;
}

/**
 * One movement against the balance. E-07 d5 says the balance is derived from
 * movements; it does not say the movements are visible, and E-07's open
 * questions record that showing them is an inference. What is NOT inferred is
 * the arithmetic — each row is a tender the store actually applied, signed by
 * the same rule that applied it, so this list and the figure cannot disagree.
 */
export interface MovementFact {
  saleId: string;
  label: string;
  at: string;
  /** Signed the way d4 signs the balance: + the store owes them, - they owe. */
  amount: number;
  ref: string;
}

export interface CustomerFacts {
  /** Held Sales — here now, collectable now. */
  held: HeldFact[];
  /**
   * Open customer-attached order lines — coming, not here. Kept apart from
   * `held` because a received line becomes a Held Sale of its own (M-02 d13),
   * so the two are consecutive states of one errand rather than one list.
   */
  openOrders: OrderFact[];
  recentSales: SaleFact[];
  movements: MovementFact[];
  thisYear: number;
  lastYear: number;
  lifetime: number;
  saleCount: number;
}

/** Tendered Sales only — a hold or an Open Sale has not been bought yet. */
function isSold(sale: Sale): boolean {
  return Boolean(sale.saleNumber) && sale.state !== "Void" && !sale.isReturn;
}

export function customerFacts(
  customer: Customer,
  input: {
    sales: Sale[];
    pendingOrders: PendingOrderLine[];
    invoices: Invoice[];
    taxLines: TaxLine[];
    records: RecordEntry[];
  },
): CustomerFacts {
  const mine = input.sales.filter((s) => s.customerId === customer.id);

  const held: HeldFact[] = mine
    .filter((s) => s.state === "Held")
    .map((s) => ({
      saleId: s.id,
      holdRef: s.holdRef ?? "—",
      titles: s.lines.filter((l) => l.kind === "item").map((l) => l.title),
      qty: s.lines.filter((l) => l.kind === "item").reduce((n, l) => n + l.qty, 0),
      days: daysAgo(s.createdAt),
    }))
    .sort((a, b) => b.days - a.days);

  const openOrders: OrderFact[] = input.pendingOrders
    .filter((l) => l.customerId === customer.id)
    .map((line) => ({
      line,
      state: orderLineState(line, input.invoices),
      title: titleFor(line, input.records),
      outstanding: outstandingQty(line, input.invoices),
    }))
    // Received lines have become Held Sales and are already above; Cancelled
    // ones are not coming. Either way there is nothing left to wait for.
    .filter((o) => !isClosedState(o.state));

  const sold = mine.filter(isSold);
  const totals = sold.map((s) => ({ sale: s, grand: saleTotals(s, input.taxLines).grand }));

  const year = new Date().getFullYear();
  const yearOf = (at: string) => Number(at.slice(0, 4));

  const sum = (rows: typeof totals) => Math.round(rows.reduce((n, r) => n + r.grand, 0) * 100) / 100;

  const movements: MovementFact[] = mine
    .filter((s) => s.state !== "Void")
    .flatMap((s) =>
      s.tenders
        .map((t) => ({ t, amount: customerBalanceDelta(t) }))
        .filter(({ amount }) => amount !== 0)
        .map(({ t, amount }) => ({
          saleId: s.id,
          label: movementLabel(t.type, amount),
          at: s.createdAt,
          amount,
          ref: s.saleNumber ? `Sale #${s.saleNumber}` : (s.holdRef ?? "in flight"),
        })),
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  return {
    held,
    openOrders,
    movements,
    recentSales: totals
      .map(({ sale, grand }) => ({
        saleId: sale.id,
        saleNumber: sale.saleNumber!,
        at: sale.createdAt,
        total: grand,
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    thisYear: sum(totals.filter((r) => yearOf(r.sale.createdAt) === year)),
    lastYear: sum(totals.filter((r) => yearOf(r.sale.createdAt) === year - 1)),
    lifetime: sum(totals),
    saleCount: totals.length,
  };
}

function movementLabel(type: string, amount: number): string {
  if (type === "Used Credit") return "Counter buy settled to credit";
  return amount > 0 ? "Paid onto account" : "Account balance drawn down";
}

function titleFor(line: PendingOrderLine, records: RecordEntry[]): string {
  const r = records.find((rec) => rec.id === line.recordId);
  return r ? `${r.artist} — ${r.title}` : "(unknown Record)";
}

/**
 * The one state a Customer can be in that anyone has to act on, and what the
 * slab bands and filters by (E-07 d17). A copy on the hold shelf is waiting;
 * something still on order is not here yet, so it is not.
 */
export function waitingCount(customer: Customer, sales: Sale[]): number {
  return sales.filter((s) => s.customerId === customer.id && s.state === "Held").length;
}

/** Search covers name, email and phone — deliberately not account number (d14). */
export function customerMatches(customer: Customer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    customer.name.toLowerCase().includes(q) ||
    customer.email.toLowerCase().includes(q) ||
    customer.phone.toLowerCase().includes(q)
  );
}
