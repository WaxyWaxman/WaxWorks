import type {
  Invoice,
  InventoryItem,
  PayableEntry,
  PaymentBatch,
  PendingOrderLine,
  RecordEntry,
  Sale,
  Supplier,
  SupplierClaim,
} from "../data/types";
import { daysAgo, invoiceBalance, payableEntryContribution, round2 } from "./totals";

// M-01 d14 — everything the ledger track shows, derived in one place so the
// slab row, the figure and the caveat line can never disagree about what a
// number means.
//
// The bases differ ON PURPOSE and each figure carries which one it is:
//
//   apBalance  Invoice TOTALS, inbound tax included — what is owed the
//              Supplier (E-02:98). Same derivation M-05 uses.
//   received   COST OF GOODS — subtotal + freight + misc, inbound tax
//              EXCLUDED (A-29, E-02 d34), because GST/QST are Input Tax
//              Credits, a receivable rather than a cost.
//
// Putting a tax-inclusive figure beside a Sold figure would overstate the
// spread by the tax rate, which is why Received is not simply the A/P number
// summed over time.

export type FlightKind = "draft" | "order" | "claim";

/** Where a row goes when it is clicked (d18). */
export type FlightDest = "receiving" | "on-order" | "claims";

export interface FlightRow {
  key: string;
  kind: FlightKind;
  /** Days since the thing started going stale — the sort key inside a group. */
  age: number;
  title: string;
  ref: string;
  meta: string;
  dest: FlightDest;
  /** The id the destination screen is deep-linked with, where there is one. */
  destId?: string;
}

export interface IntakeRow {
  invoiceId: string;
  invoiceNumber: string;
  at: string;
  lines: number;
  copies: number;
  cogs: number;
}

export interface SupplierTrade {
  /** Cost of goods received in the window. */
  received: number;
  /** Retail taken for copies traceable to this Supplier. */
  sold: number;
  copiesIn: number;
  copiesSold: number;
  /** Null when there is nothing to divide by, or nothing sold. */
  marginPct: number | null;
  /**
   * Sold copies with no Invoice behind them — oversold (E-05 d21) or stock
   * predating the system. They attribute to no Supplier, so they are excluded
   * and COUNTED rather than silently dropped (d14).
   */
  unattributed: number;
}

export interface SupplierFacts {
  apBalance: number;
  flight: FlightRow[];
  trade: SupplierTrade;
  intake: IntakeRow[];
  /** The draft the foot's ladder opens first, if there is one (d15). */
  openDraft: Invoice | null;
  /** Pending, unplaced order lines — the ladder's second rung. */
  pendingLines: PendingOrderLine[];
}

export interface FactsInput {
  invoices: Invoice[];
  payableEntries: PayableEntry[];
  paymentBatches: PaymentBatch[];
  claims: SupplierClaim[];
  pendingOrders: PendingOrderLine[];
  inventory: InventoryItem[];
  sales: Sale[];
  records: RecordEntry[];
}

const TRADE_WINDOW_DAYS = 365;

/**
 * Cost of goods on one Invoice (A-29, E-02 d34): `subtotal + freight + misc`.
 * The subtotal is derived from the lines rather than read off `statedSubtotal`
 * — that field is what the supplier's paperwork claims, and reconciling the
 * two is E-02's job, not this one's.
 */
export function invoiceCogs(iv: Invoice): number {
  const lines = iv.lines.reduce((n, l) => n + l.cost * l.qty, 0);
  return round2(lines + iv.freight + iv.misc);
}

export function supplierApBalance(
  supplierId: string,
  input: Pick<FactsInput, "invoices" | "payableEntries" | "paymentBatches">,
): number {
  const invoices = input.invoices
    .filter((iv) => iv.supplierId === supplierId && iv.status === "Finalized")
    .reduce((sum, iv) => sum + invoiceBalance(iv, input.paymentBatches), 0);
  const entries = input.payableEntries
    .filter((e) => e.supplierId === supplierId)
    .reduce((sum, e) => sum + payableEntryContribution(e, input.paymentBatches), 0);
  return round2(invoices + entries);
}

export function supplierFacts(supplier: Supplier, input: FactsInput): SupplierFacts {
  const id = supplier.id;
  const titleOf = (recordId: string) => {
    const r = input.records.find((x) => x.id === recordId);
    return r ? `${r.artist} — ${r.title}` : "(unknown title)";
  };

  const invoices = input.invoices.filter((iv) => iv.supplierId === id);
  const drafts = invoices.filter((iv) => iv.status === "Draft");
  const lines = input.pendingOrders.filter((l) => l.supplierId === id && !l.poVoidedAt);
  const openClaims = input.claims.filter(
    (c) => c.supplierId === id && c.status === "Pending" && c.claimNumber != null,
  );

  // ---- in flight (d14) ----
  const flight: FlightRow[] = [];

  for (const iv of drafts) {
    const scanned = iv.lines.length;
    flight.push({
      key: `draft:${iv.id}`,
      kind: "draft",
      age: daysAgo(iv.createdAt),
      title: `Draft invoice ${iv.invoiceNumber || "(unnumbered)"}`,
      ref: "DRAFT",
      meta:
        `opened ${dayPhrase(daysAgo(iv.createdAt))} · ` +
        `${scanned} ${scanned === 1 ? "line" : "lines"} so far · started by ${iv.createdBy}`,
      dest: "receiving",
      destId: iv.id,
    });
  }

  // A PurchaseOrder is one row, not one per line — a box arrives against the
  // PO, and six rows for six lines would bury the two claims underneath it.
  // Unplaced lines group under a single "not yet placed" row for the same
  // reason (M-02 phase 1).
  const placed = lines.filter((l) => l.poNumber);
  const unplaced = lines.filter((l) => !l.poNumber);

  for (const [po, group] of groupBy(placed, (l) => l.poNumber as string)) {
    const outstanding = group.filter((l) => l.status !== "Cancelled");
    if (outstanding.length === 0) continue;
    const oldest = Math.max(...outstanding.map((l) => daysAgo(l.placedAt ?? l.createdAt)));
    const backordered = outstanding.filter((l) => l.status === "Backordered").length;
    const shipped = outstanding.filter((l) => l.status === "Shipped").length;
    const say = [
      `placed ${dayPhrase(oldest)}`,
      shipped > 0 ? `${shipped} marked Shipped` : null,
      backordered > 0 ? `${backordered} Backordered by them` : null,
    ].filter(Boolean);
    flight.push({
      key: `po:${po}`,
      kind: "order",
      age: oldest,
      title: `PO ${po} — ${outstanding.length} ${outstanding.length === 1 ? "line" : "lines"} outstanding`,
      ref: po,
      meta: say.join(" · "),
      dest: "on-order",
    });
  }

  if (unplaced.length > 0) {
    const oldest = Math.max(...unplaced.map((l) => daysAgo(l.createdAt)));
    const retail = round2(unplaced.reduce((n, l) => n + l.sellPrice * l.qty, 0));
    flight.push({
      key: "po:unplaced",
      kind: "order",
      age: oldest,
      title: `${unplaced.length} ${unplaced.length === 1 ? "line" : "lines"} pending, not yet placed`,
      ref: "no PO",
      meta: `oldest raised ${dayPhrase(oldest)} · $${retail.toFixed(2)} at retail`,
      dest: "on-order",
    });
  }

  for (const c of openClaims) {
    const copies = c.lines.reduce((n, l) => n + l.qty, 0);
    const reason = c.lines[0]?.reason ?? "no reason given";
    // A one-line claim is about a specific copy, and naming it is what makes
    // the row actionable without opening it. More than one and the title
    // would be arbitrary, so the count carries it instead.
    const about =
      c.lines.length === 1 && c.lines[0] ? ` · ${titleOf(c.lines[0].recordId)}` : "";
    flight.push({
      key: `claim:${c.id}`,
      kind: "claim",
      age: daysAgo(c.createdAt),
      title: `Claim #${c.claimNumber} — no reply`,
      ref: `#${c.claimNumber}`,
      meta:
        `sent ${dayPhrase(daysAgo(c.createdAt))} · ${reason.toLowerCase()}, ` +
        `${copies} ${copies === 1 ? "copy" : "copies"}${about}`,
      dest: "claims",
    });
  }

  // ---- trade (d14) ----
  const finalized = invoices.filter((iv) => iv.status !== "Draft");
  const inWindow = finalized.filter((iv) => daysAgo(iv.receivedDate) <= TRADE_WINDOW_DAYS);

  const received = round2(inWindow.reduce((n, iv) => n + invoiceCogs(iv), 0));
  const copiesIn = inWindow.reduce((n, iv) => n + iv.lines.reduce((m, l) => m + l.qty, 0), 0);

  // Sold is summed over the SaleLines whose copy traces to this Supplier.
  // `supplierId` is only set when the item arrived on an Invoice that traces
  // to one, which is precisely the attribution gap counted below.
  const itemSupplier = new Map(input.inventory.map((i) => [i.id, i.supplierId]));
  let sold = 0;
  let copiesSold = 0;
  let unattributed = 0;
  for (const sale of input.sales) {
    if (sale.state === "Void" || !sale.saleNumber || sale.isReturn) continue;
    if (daysAgo(sale.createdAt) > TRADE_WINDOW_DAYS) continue;
    for (const line of sale.lines) {
      if (line.kind !== "item" || !line.inventoryItemId || line.qty <= 0) continue;
      const owner = itemSupplier.get(line.inventoryItemId);
      if (owner === id) {
        sold += line.price * line.qty * (1 - line.discountPct / 100);
        copiesSold += line.qty;
      } else if (owner === undefined) {
        unattributed += line.qty;
      }
    }
  }
  sold = round2(sold);

  // Margin only means something with both halves present. Freight and misc
  // stay at Invoice level and are never allocated to items, so what this
  // reports is overstated — the caveat is stated wherever it is shown
  // (E-02 d34's accepted consequence, M-03).
  const marginPct = sold > 0 && received > 0 ? round2(((sold - received) / sold) * 100) : null;

  // ---- recent intake (d18) ----
  const intake: IntakeRow[] = finalized
    .slice()
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
    .slice(0, 6)
    .map((iv) => ({
      invoiceId: iv.id,
      invoiceNumber: iv.invoiceNumber,
      at: iv.receivedDate,
      lines: iv.lines.length,
      copies: iv.lines.reduce((n, l) => n + l.qty, 0),
      cogs: invoiceCogs(iv),
    }));

  return {
    apBalance: supplierApBalance(id, input),
    flight,
    trade: { received, sold, copiesIn, copiesSold, marginPct, unattributed },
    intake,
    // Oldest draft first: it is the one that has been open longest.
    openDraft: drafts.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null,
    pendingLines: unplaced,
  };
}

/** Positive means the store owes them; negative is a credit in our favour. */
export function apState(balance: number): "owed" | "credit" | "nil" {
  if (balance > 0.005) return "owed";
  if (balance < -0.005) return "credit";
  return "nil";
}

/**
 * Grouped by kind in a fixed order, oldest first inside each (d14). The order
 * is a priority order: a draft is ours to finish, a PurchaseOrder is theirs to
 * ship, a claim is theirs to answer.
 */
export const FLIGHT_ORDER: FlightKind[] = ["draft", "order", "claim"];

export function groupFlight(rows: FlightRow[]): { kind: FlightKind; rows: FlightRow[] }[] {
  return FLIGHT_ORDER.map((kind) => ({
    kind,
    rows: rows.filter((r) => r.kind === kind).sort((a, b) => b.age - a.age),
  })).filter((g) => g.rows.length > 0);
}

function dayPhrase(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}
