import { cellFor, resolveLineTax, roundHalfAwayFromZero, taxTotal } from "./tax";
import { isOpenOrderLine } from "./orderLines";
import type {
  ClaimVoid,
  InventoryItem,
  Invoice,
  PayableEntry,
  PaymentBatch,
  PaymentBatchVoid,
  PayableTargetKind,
  PendingOrderLine,
  Sale,
  SaleLine,
  Supplier,
  SupplierClaim,
  TaxComponent,
  TaxType,
  TaxGroupCell,
  Tender,
} from "../data/types";

export const lineGross = (l: SaleLine): number => l.qty * l.price;
export const lineNet = (l: SaleLine): number =>
  l.qty * l.price * (1 - l.discountPct / 100);

// M-06 d14's two coordinates, gathered so no caller invents its own lookup.
// `groupId` is the Customer's tax group or the store's default; `at` is the
// moment the money moves (A-57), which is what decides WHICH rate applies
// (A-58) when a pending change is queued.
export interface TaxContext {
  types: TaxType[];
  cells: TaxGroupCell[];
  groupId: string;
  at: string;
}

// The line's tax, per type.
//
// A SNAPSHOT WINS. A-57 takes the tax snapshot at tender, so a completed Sale
// reports what it actually charged even after a rate changes — that is the
// whole reason no rate-history table is needed. While the Sale is open there
// is no snapshot and the screen computes live, which is correct rather than a
// fallback: nothing has been collected yet.
export function lineTaxComponents(l: SaleLine, ctx: TaxContext): TaxComponent[] {
  if (l.tax) return l.tax;
  return resolveLineTax(lineNet(l), cellFor(ctx.cells, ctx.groupId, l.productTaxCode), ctx.types, ctx.at);
}

export function lineTax(l: SaleLine, ctx: TaxContext): number {
  return taxTotal(lineTaxComponents(l, ctx));
}

export interface SaleTotals {
  subtotal: number; // net of line discounts, pre-tax
  discount: number; // total discount given
  tax: number;
  grand: number;
  // Per type, because M-03 d13 reports per type and d15 splits by rate. A
  // single figure is what the flat model could give and is the reason it had
  // to go.
  taxByType: { code: string; name: string; ratePpm: number; amount: number }[];
}

export function saleTotals(sale: Sale, ctx: TaxContext): SaleTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  // Keyed by type AND rate, so a period spanning a rate change splits itself
  // (M-03 d15) instead of blending two rates into one line.
  const byType = new Map<string, { code: string; name: string; ratePpm: number; amount: number }>();
  for (const l of sale.lines) {
    subtotal += lineNet(l);
    discount += lineGross(l) - lineNet(l);
    for (const c of lineTaxComponents(l, ctx)) {
      tax += c.amount;
      const key = `${c.code}:${c.ratePpm}`;
      const seen = byType.get(key);
      if (seen) seen.amount = round2(seen.amount + c.amount);
      else byType.set(key, { ...c });
    }
  }
  const grand = subtotal + tax;
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax: round2(tax),
    grand: round2(grand),
    taxByType: [...byType.values()],
  };
}

export const tenderedTotal = (sale: Sale): number =>
  round2(sale.tenders.reduce((s, t) => s + t.amount, 0));

export const balanceDue = (sale: Sale, ctx: TaxContext): number =>
  round2(saleTotals(sale, ctx).grand - tenderedTotal(sale));

// A-47 — half AWAY FROM ZERO, not Math.round's half-up, so a negative-quantity
// Return line rounds symmetrically to the Sale that produced it (A-49 names
// exactly this case). One rounding rule governs the whole money path.
export const round2 = roundHalfAwayFromZero;

/**
 * What one tender does to a Customer's A/R balance, signed the way E-07 d4
 * signs it: positive means the store owes them more (store credit), negative
 * means they owe the store.
 *
 * Lives here rather than inside the store because two things read it now —
 * the store applies it at tender, and E-07's account track lists the
 * movements it produced. Two copies of this rule would drift.
 */
export function customerBalanceDelta(tender: Pick<Tender, "type" | "amount" | "accountDirection">): number {
  if (tender.type === "Used Credit") return Math.abs(tender.amount);
  if (tender.type !== "Account Balance") return 0;
  return tender.accountDirection === "add" ? Math.abs(tender.amount) : -tender.amount;
}

// ---- Stock math (E-04 d2, architecture §5.1) ----

/**
 * §5.1's FIRST TERM on its own: the copies the store physically holds.
 *
 * Not the on-hand figure, and the difference matters. "Is there one on the
 * shelf I can sell you" is this question; "what do we own, net of what we have
 * already sold and not received" is `onHand` below. A Record can hold a copy
 * and still be net negative.
 */
export const copiesPresent = (recordId: string, inv: InventoryItem[]): number =>
  inv.filter((i) => i.recordId === recordId && (i.status === "sellable" || i.status === "held")).length;

/**
 * Oversold copies still owed — minted straight from a Sale before any Invoice
 * line backed them (E-02 d21) and not yet reconciled (E-04 d19).
 */
export const oversoldCopies = (recordId: string, inv: InventoryItem[]): InventoryItem[] =>
  inv.filter((i) => i.recordId === recordId && i.oversold && !i.oversoldReconciledAt);

export const oversoldOutstanding = (recordId: string, inv: InventoryItem[]): number =>
  oversoldCopies(recordId, inv).length;

/**
 * On hand, **derived and able to go negative** — architecture §5.1, verbatim:
 *
 *     on_hand = count(items where status in ('sellable','held'))
 *             - count(items where origin = 'oversold' and reconciled_at is null)
 *
 * The second term was missing, so this returned a figure that could never go
 * below zero while being printed under the label "On hand (derived)". §5.1 and
 * A-20a exist precisely so it can: a genuinely negative count is the whole
 * point of E-02 d21's negative inventory, and clamping it at the first term
 * hid the debt on every screen that asked.
 */
export const onHand = (recordId: string, inv: InventoryItem[]): number =>
  copiesPresent(recordId, inv) - oversoldOutstanding(recordId, inv);

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

// ---- Accounts payable (M-05), as decided in d16-d30 and architecture A-36/A-37 ----
//
// The whole of this section exists so that ONE derivation answers "what is
// owed", and both the Accounts Payable screen and the Supplier card read it.
// Two copies of this arithmetic would drift, and the figure they disagreed
// about would be money.

/** A void is its own artifact (d22, A-33a), so a batch is live until one names it. */
export const batchIsVoided = (b: PaymentBatch, voids: PaymentBatchVoid[]): boolean =>
  voids.some((v) => v.batchId === b.id);

export const liveBatches = (batches: PaymentBatch[], voids: PaymentBatchVoid[]): PaymentBatch[] =>
  batches.filter((b) => !batchIsVoided(b, voids));

/**
 * Everything a target has received from live batches — BOTH kinds. d19 put
 * money and claim credit in one batch, and d26 means an attached credit
 * settles an Invoice exactly as money does.
 */
const settledAgainst = (
  kind: PayableTargetKind,
  id: string,
  batches: PaymentBatch[],
  voids: PaymentBatchVoid[],
): number =>
  round2(
    liveBatches(batches, voids)
      .flatMap((b) => b.targets)
      .filter((t) => t.kind === kind && t.id === id)
      .reduce((sum, t) => sum + t.amount, 0),
  );

export const invoicePaidToDate = (iv: Invoice, batches: PaymentBatch[], voids: PaymentBatchVoid[]): number =>
  settledAgainst("invoice", iv.id, batches, voids);

export const invoiceBalance = (iv: Invoice, batches: PaymentBatch[], voids: PaymentBatchVoid[]): number =>
  round2(invoiceTotal(iv) - invoicePaidToDate(iv, batches, voids));

/**
 * A-33b: `paid` is DERIVED, never stored. Finalized, balance at or below
 * zero, and at least one settlement actually landed on it. The third clause
 * is load-bearing — without it a zero-total Invoice would be born immutable
 * and could never be corrected, which is the failure A-33 exists to prevent.
 */
export const invoiceIsPaid = (iv: Invoice, batches: PaymentBatch[], voids: PaymentBatchVoid[]): boolean =>
  !!iv.finalizedAt &&
  invoiceBalance(iv, batches, voids) <= 0.005 &&
  invoicePaidToDate(iv, batches, voids) > 0.005;

/**
 * M-05 d37 — an Invoice is frozen while ANY non-voided PaymentBatch targets
 * it. Amends E-02 d40, which made it correctable "until paid".
 *
 * `invoiceIsPaid` already refused every edit to a FULLY paid Invoice (A-41).
 * The gap was the PARTLY paid one: not paid, therefore correctable, therefore
 * amendable while money stood against it — and d22's void would then return
 * that money to a target that no longer said what it said. Forcing the order
 * removes the case: void the payment, correct, re-record (d40 pre-fills the
 * re-record so the retyping is not punitive).
 *
 * Same shape as A-33's "paid blocks the edit" and A-66's "banked blocks the
 * undo": a change is refused while something downstream depends on it, and
 * permitted the moment that dependency is lifted.
 */
export const invoiceIsFrozen = (iv: Invoice, batches: PaymentBatch[], voids: PaymentBatchVoid[]): boolean =>
  !!iv.finalizedAt && invoicePaidToDate(iv, batches, voids) > 0.005;

// ---- manual ledger entries (d12) and the artifacts that look like them ----

/** The unsigned face value: what was typed, always positive. */
export const payableEntryTotal = (e: PayableEntry): number => round2(e.subtotal + e.tax + e.freight + e.misc);

/**
 * d29 — a Claim placeholder carries TWO figures. This is the face one, which
 * is what d15's sum-to-zero test reads. Its contribution to the balance is
 * zero, and that is `payableEntryContribution` below. On one figure d14, d15
 * and d27 cannot all hold.
 */
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

/** Only these are ever paid down. A Credit lands whole; a placeholder never lands. */
export const payableEntryIsPayable = (e: PayableEntry): boolean =>
  e.type === "Invoice" || e.type === "Consignment" || (e.type === "Adjustment" && e.adjustmentDirection !== "decrease");

export const payableEntryPaidToDate = (e: PayableEntry, batches: PaymentBatch[], voids: PaymentBatchVoid[]): number =>
  settledAgainst("entry", e.id, batches, voids);

export const payableEntryBalance = (e: PayableEntry, batches: PaymentBatch[], voids: PaymentBatchVoid[]): number =>
  round2(payableEntryTotal(e) - payableEntryPaidToDate(e, batches, voids));

// ---- credits: what counts, and whether it has been spent ----

/** E-04 d20 — the memo is the point of truth, not the claim. */
export const claimCreditAmount = (c: SupplierClaim): number =>
  round2(c.creditedAmount ?? claimTotal(c));

/**
 * d26 — the line is AGREED vs not yet agreed, not claim vs manual entry.
 * A Credited claim counts; a Pending one and a Claim placeholder do not.
 *
 * A plain status read, and architecture A-46 is why it is allowed to be one
 * again. A-44 had made a void a second terminal mechanism, so this function
 * took the void rows to keep a voided claim out of the balance. E-04 d29 turns
 * a void into a REVERSAL that returns the claim to unsent — status `Pending`,
 * no sent date — so it fails this test on the status alone. Carrying the
 * parameter now would be a guard against something that can no longer happen.
 */
export const claimIsAgreed = (c: SupplierClaim): boolean => c.status === "Credited";

/**
 * A-37, as restated by A-69 — consumed is DERIVED from a live BATCH naming
 * this credit, not from a target naming it. No `applied`, no `consumed_at`:
 * d22's void un-consumes it by the absence of that batch, with nothing to flip.
 *
 * Reading it off targets was the shape A-69 retires. It could not answer for a
 * credit that was ticked but never drawn down — no target named it, so it read
 * as un-consumed while a remainder had already been emitted for its full value,
 * and the balance moved by money nobody paid (M-05 d26).
 */
export const creditIsConsumed = (
  creditId: string,
  batches: PaymentBatch[],
  voids: PaymentBatchVoid[],
): boolean =>
  liveBatches(batches, voids).some((b) => b.credits.some((c) => c.creditId === creditId));

/**
 * What an entry contributes to the Supplier's balance right now.
 * A Claim placeholder: nothing, ever (d14, d27).
 * A Credit: its full negative value until it is CONSUMED — being *cleared*
 * does not change this, because d15 says a cleared Credit stays counted.
 */
export function payableEntryContribution(
  e: PayableEntry,
  batches: PaymentBatch[],
  voids: PaymentBatchVoid[],
): number {
  if (e.type === "Claim") return 0;
  if (payableEntryIsPayable(e)) return payableEntryBalance(e, batches, voids);
  if (e.type === "Credit") return creditIsConsumed(e.id, batches, voids) ? 0 : payableEntrySignedAmount(e);
  return payableEntrySignedAmount(e); // a decreasing Adjustment: lands whole, never attachable
}

export interface PayablesInput {
  invoices: Invoice[];
  payableEntries: PayableEntry[];
  claims: SupplierClaim[];
  paymentBatches: PaymentBatch[];
  batchVoids: PaymentBatchVoid[];
  // E-04 d27 / architecture A-44. A claim is finished by a STATUS (Abandoned)
  // or by the presence of a ROW here (voided), and A-44 records the cost of
  // that: any query remembering only the first counts voided claims as live.
  // This is the second half, carried so `claimIsAgreed` can consult both.
  claimVoids: ClaimVoid[];
}

/**
 * A-36's four terms, and the ONE place they live. Every one earns its place:
 * drop any and one of M-05's worked examples breaks.
 *
 * At the SUPPLIER level a credit reduces the balance whether it is attached
 * or not, and attaching is a re-labelling — which is why d26 can say
 * "applying a credit never moves the balance" and be arithmetically true.
 * At the INVOICE level only an attached credit reduces that Invoice.
 *
 * May be negative (d25): the supplier owes the store. Nothing clamps it.
 */
export function supplierBalance(supplierId: string, input: PayablesInput): number {
  const { invoices, payableEntries, claims, paymentBatches: b, batchVoids: v } = input;

  const fromInvoices = invoices
    .filter((iv) => iv.supplierId === supplierId && iv.status !== "Draft")
    .reduce((sum, iv) => sum + invoiceBalance(iv, b, v), 0);

  const fromEntries = payableEntries
    .filter((e) => e.supplierId === supplierId)
    .reduce((sum, e) => sum + payableEntryContribution(e, b, v), 0);

  const fromClaims = claims
    .filter((c) => c.supplierId === supplierId && claimIsAgreed(c) && !creditIsConsumed(c.id, b, v))
    .reduce((sum, c) => sum - claimCreditAmount(c), 0);

  return round2(fromInvoices + fromEntries + fromClaims);
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
