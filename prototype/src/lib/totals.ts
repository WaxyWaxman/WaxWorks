import type { InventoryItem, PendingOrderLine, Sale, SaleLine, Supplier, TaxLine } from "../data/types";

export const lineGross = (l: SaleLine): number => l.qty * l.price;
export const lineNet = (l: SaleLine): number =>
  l.qty * l.price * (1 - l.discountPct / 100);

export function lineTax(l: SaleLine, taxLines: TaxLine[]): number {
  const tl = taxLines.find((t) => t.id === l.taxLineId);
  return lineNet(l) * (tl ? tl.rate : 0);
}

export interface SaleTotals {
  subtotal: number; // net of line discounts, pre-tax
  discount: number; // total discount given
  tax: number;
  grand: number;
}

export function saleTotals(sale: Sale, taxLines: TaxLine[]): SaleTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const l of sale.lines) {
    subtotal += lineNet(l);
    discount += lineGross(l) - lineNet(l);
    tax += lineTax(l, taxLines);
  }
  const grand = subtotal + tax;
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax: round2(tax),
    grand: round2(grand),
  };
}

export const tenderedTotal = (sale: Sale): number =>
  round2(sale.tenders.reduce((s, t) => s + t.amount, 0));

export const balanceDue = (sale: Sale, taxLines: TaxLine[]): number =>
  round2(saleTotals(sale, taxLines).grand - tenderedTotal(sale));

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---- Stock math (E-04): on hand is derived from sellable copies ----
export const onHand = (recordId: string, inv: InventoryItem[]): number =>
  inv.filter((i) => i.recordId === recordId && (i.status === "sellable" || i.status === "held")).length;

export const availableOnHand = (recordId: string, inv: InventoryItem[]): number =>
  inv.filter((i) => i.recordId === recordId && i.status === "sellable").length;

export const heldCount = (recordId: string, inv: InventoryItem[]): number =>
  inv.filter((i) => i.recordId === recordId && i.status === "held").length;

export const backroomCount = (recordId: string, inv: InventoryItem[]): number =>
  inv.filter((i) => i.recordId === recordId && i.status === "sellable" && i.backroom).length;

// ---- Ordering (M-02): a stream is "ready to place" once it hits the
// Supplier's minimum — units first, falling back to a dollar minimum priced
// at whichever basis the Supplier names (decision 4, doc comment on
// Supplier.minOrderQty).
export function orderReady(
  supplier: Pick<Supplier, "minOrderQty" | "minOrderAmount" | "minOrderAmountBasis">,
  totalQty: number,
  sellTotal: number,
  estCost: number,
): boolean {
  if (supplier.minOrderQty > 0) return totalQty >= supplier.minOrderQty;
  if (supplier.minOrderAmount > 0) {
    const basisTotal = supplier.minOrderAmountBasis === "Net" ? estCost : sellTotal;
    return basisTotal >= supplier.minOrderAmount;
  }
  return true;
}

export const daysAgo = (at: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(at.replace(" ", "T")).getTime()) / 86400000));

// ---- Follow-up flag (M-02 decision 8, consumed by Phase 3 / What's on
// Order): the window restarts from `followUpSetAt` (falling back to
// `createdAt` for a line never re-flagged) and runs for `followUpDays`.
export function followUpDueAt(line: Pick<PendingOrderLine, "followUpDays" | "followUpSetAt" | "createdAt">): number | undefined {
  if (line.followUpDays == null) return undefined;
  const base = new Date((line.followUpSetAt ?? line.createdAt).replace(" ", "T")).getTime();
  return base + line.followUpDays * 86400000;
}

export function isFollowUpOverdue(
  line: Pick<PendingOrderLine, "followUpDays" | "followUpSetAt" | "createdAt">,
): boolean {
  const due = followUpDueAt(line);
  return due != null && due <= Date.now();
}

// Every separator currently in use across a Supplier's still-pending lines
// (key "" = no separator / the regular pile) — drives a Sep dropdown's
// options and the merge check, wherever one appears: raising a line (Phase
// 1), Order Processing's pending table (a whole-stream shift), and View's
// per-line dropdown.
export function separatorCounts(pendingOrders: PendingOrderLine[], supplierId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of pendingOrders) {
    if (o.supplierId !== supplierId || o.poNumber) continue;
    const key = o.separator ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
