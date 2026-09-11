import { isOpenOrderLine } from "./orderLines";
import type {
  InventoryItem,
  Invoice,
  PayableEntry,
  PaymentBatch,
  PendingOrderLine,
  Sale,
  SaleLine,
  Supplier,
  SupplierClaim,
  TaxLine,
} from "../data/types";

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

// ---- Accounts payable (M-05) — a balance is always derived (payments,
// applied credits, entry amounts), never edited directly (decision 8).
export const invoiceTotal = (iv: Invoice): number => {
  const derivedSubtotal = round2(iv.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
  return iv.totalOverride ?? round2(derivedSubtotal + iv.tax + iv.freight + iv.misc);
};

export const claimTotal = (c: SupplierClaim): number =>
  round2(c.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));

// Every PaymentBatch that put money toward one target ("invoice" + its id,
// or "entry" + its id) — batches live at the top level (one row per
// Record-Payment action, M-05 decision), not nested under what they paid.
const targetPaidToDate = (kind: "invoice" | "entry", id: string, batches: PaymentBatch[]): number =>
  round2(
    batches
      .flatMap((b) => b.targets)
      .filter((t) => t.kind === kind && t.id === id)
      .reduce((sum, t) => sum + t.amount, 0),
  );

// A claim's credit isn't earmarked to one Invoice (decision 11) — it's
// distributed across several by AppStore's applyClaimCredit, which is why
// creditsApplied lives on the Invoice rather than being looked up by claim.
export const invoicePaidToDate = (iv: Invoice, batches: PaymentBatch[]): number =>
  round2(targetPaidToDate("invoice", iv.id, batches) + iv.creditsApplied.reduce((sum, c) => sum + c.amount, 0));

export const invoiceBalance = (iv: Invoice, batches: PaymentBatch[]): number =>
  round2(invoiceTotal(iv) - invoicePaidToDate(iv, batches));

// ---- Accounts payable — manual ledger entries (M-05 "Create new") ----
// The unsigned face value: what the Manager typed in, always a plain
// positive dollar figure regardless of which way the entry moves the balance.
export const payableEntryTotal = (e: PayableEntry): number => round2(e.subtotal + e.tax + e.freight + e.misc);

// The signed amount an entry contributes: positive increases what's owed,
// negative decreases it. Claim is deliberately excluded from balance sums
// entirely (see sumOutstandingForSupplier) even though it carries a sign
// here — a positive Claim is what lets it net to zero against the negative
// Credit that eventually replaces it, for the manual "Clear" tool.
export function payableEntrySignedAmount(e: PayableEntry): number {
  const total = payableEntryTotal(e);
  switch (e.type) {
    case "Credit":
      return -total;
    case "Adjustment":
      return e.adjustmentDirection === "decrease" ? -total : total;
    default: // Invoice, Consignment, Claim
      return total;
  }
}

// Only Invoice/Consignment/Adjustment-that-increases are ever "paid down" —
// a Credit already fully lands the moment it's created, and a Claim doesn't
// count toward anything until Cleared, so neither has a balance of its own.
export const payableEntryIsPayable = (e: PayableEntry): boolean =>
  e.type === "Invoice" || e.type === "Consignment" || (e.type === "Adjustment" && e.adjustmentDirection !== "decrease");

export const payableEntryPaidToDate = (e: PayableEntry, batches: PaymentBatch[]): number =>
  targetPaidToDate("entry", e.id, batches);

export const payableEntryBalance = (e: PayableEntry, batches: PaymentBatch[]): number =>
  round2(payableEntryTotal(e) - payableEntryPaidToDate(e, batches));

// What the entry currently contributes to the Supplier's total balance —
// 0 for a Claim (never counts, Cleared or not); the full signed amount for
// a Credit or a decrease Adjustment (already fully in effect the moment
// it's created, nothing to pay down); the remaining balance for a payable
// type as it gets paid off. Being Cleared doesn't change this — clearing is
// bookkeeping tidiness (see PayableEntry.clearedWith), not a reversal.
export function payableEntryContribution(e: PayableEntry, batches: PaymentBatch[]): number {
  if (e.type === "Claim") return 0;
  if (payableEntryIsPayable(e)) return payableEntryBalance(e, batches);
  return payableEntrySignedAmount(e);
}

// Every separator currently in use across a Supplier's still-pending lines
// (key "" = no separator / the regular pile) — drives a Sep dropdown's
// options and the merge check, wherever one appears: raising a line (Phase
// 1), Order Processing's pending table (a whole-stream shift), and View's
// per-line dropdown.
export function separatorCounts(
  pendingOrders: PendingOrderLine[],
  supplierId: string,
  invoices: Invoice[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of pendingOrders) {
    // Received and cancelled lines are not waiting to be sent anywhere.
    if (o.supplierId !== supplierId || o.poNumber) continue;
    if (!isOpenOrderLine(o, invoices)) continue;
    const key = o.separator ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
