import type { InventoryItem, RecordEntry, Sale, TaxLine } from "../data/types";
import { lineNet, lineTax, onHand, round2 } from "./totals";

// M-03 — the same breakdown backs both View Subtotal (read-only) and Total
// Today's Sales (which also closes the batch). Sales/tender/tax/section
// figures are scoped to Sales currently in "Current" state — exactly what's
// about to be closed. Movements (voids, holds, pay-outs) are scoped to
// everything in memory rather than "since the last close," since this
// prototype has no persistence across sessions to track that boundary —
// acceptable for a single-session demo, not a real close's audit trail.
export interface DayBreakdown {
  transactionCount: number;
  grossSales: number;
  returnsAmount: number; // negative
  netSales: number;
  bySection: { label: string; amount: number }[];
  // Labelled rather than keyed by type, because Account Balance moves both
  // ways and netting a day's top-ups against its draw-downs under one row
  // reports $0 for two real movements (M-03 d14).
  byTender: { label: string; amount: number }[];
  byTaxLine: { name: string; amount: number }[];
  // Money that came through a tender without being a sale, so the tender
  // column can be reconciled against net sales instead of silently
  // disagreeing with it (M-03 d14).
  giftCardsLoaded: number;
  voidCount: number;
  holdsCreatedCount: number;
  holdsCancelledCount: number;
  payouts: { saleLabel: string; note: string; amount: number }[];
  belowMin: { recordId: string; label: string; onHand: number; minOnHand: number }[];
}

export function computeDayBreakdown(
  sales: Sale[],
  records: RecordEntry[],
  taxLines: TaxLine[],
  inventory: InventoryItem[],
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

  let grossSales = 0;
  let returnsAmount = 0;
  let giftCardsLoaded = 0;
  const sectionAmounts = new Map<string, number>();
  const taxAmounts = new Map<string, number>();

  for (const sale of current) {
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
      if (l.qty >= 0) grossSales += net;
      else returnsAmount += net;
      const label = recordFor(l.recordId)?.section ?? "Non-tracked";
      sectionAmounts.set(label, round2((sectionAmounts.get(label) ?? 0) + net));
      const tl = taxLines.find((t) => t.id === l.taxLineId);
      const tax = round2(lineTax(l, taxLines));
      if (tax !== 0) taxAmounts.set(tl?.name ?? "Unknown", round2((taxAmounts.get(tl?.name ?? "Unknown") ?? 0) + tax));
    }
  }

  const tenderAmounts = new Map<string, number>();
  const payouts: DayBreakdown["payouts"] = [];
  for (const sale of current) {
    for (const t of sale.tenders) {
      // Account Balance is the one tender that runs both directions — a
      // customer paying onto their account and a customer spending the
      // credit are opposite movements that happen to share a type. Reported
      // separately so a day that did $100 of each doesn't read as $0.
      const label =
        t.type === "Account Balance"
          ? `Account Balance (${t.accountDirection === "add" ? "added" : "drawn"})`
          : t.type;
      tenderAmounts.set(label, round2((tenderAmounts.get(label) ?? 0) + t.amount));
      if (t.type === "Pay-out") {
        payouts.push({ saleLabel: sale.saleNumber ? `#${sale.saleNumber}` : "—", note: t.note ?? "", amount: t.amount });
      }
    }
  }

  // holdRef persists on a Sale even after it tenders out of Held, so a later
  // Void of an already-tendered ex-hold Sale isn't a "hold cancelled" — the
  // log's own wording (cancelHold vs. voidSale) is the reliable signal.
  const wasHoldCancel = (s: Sale) => s.log.some((e) => e.text.startsWith("Hold cancelled"));
  const voidCount = sales.filter((s) => s.state === "Void" && !wasHoldCancel(s)).length;
  const holdsCreatedCount = sales.filter((s) => !!s.holdRef).length;
  const holdsCancelledCount = sales.filter((s) => s.state === "Void" && wasHoldCancel(s)).length;

  const belowMin = records
    .filter((r) => onHand(r.id, inventory) < r.minOnHand)
    .map((r) => ({ recordId: r.id, label: `${r.artist} — ${r.title}`, onHand: onHand(r.id, inventory), minOnHand: r.minOnHand }));

  return {
    transactionCount: current.length,
    grossSales: round2(grossSales),
    returnsAmount: round2(returnsAmount),
    netSales: round2(grossSales + returnsAmount),
    bySection: [...sectionAmounts.entries()].map(([label, amount]) => ({ label, amount })),
    byTender: [...tenderAmounts.entries()].map(([label, amount]) => ({ label, amount })),
    byTaxLine: [...taxAmounts.entries()].map(([name, amount]) => ({ name, amount })),
    giftCardsLoaded,
    voidCount,
    holdsCreatedCount,
    holdsCancelledCount,
    payouts,
    belowMin,
  };
}
