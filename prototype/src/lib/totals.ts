import type { InventoryItem, Sale, SaleLine, TaxLine } from "../data/types";

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
