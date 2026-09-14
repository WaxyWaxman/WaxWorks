import type {
  Invoice,
  PayableEntry,
  PayableEntrySource,
  PaymentBatch,
  PaymentBatchVoid,
  PaymentTerms,
  Supplier,
  SupplierClaim,
} from "../data/types";
import { TERM_DAYS } from "../data/types";
import {
  claimCreditAmount,
  claimIsAgreed,
  claimTotal,
  creditIsConsumed,
  invoiceBalance,
  invoiceIsPaid,
  invoicePaidToDate,
  invoiceTotal,
  payableEntryBalance,
  payableEntryContribution,
  payableEntryIsPayable,
  payableEntryPaidToDate,
  payableEntrySignedAmount,
  payableEntryTotal,
  round2,
} from "./totals";

/**
 * Accounts payable, as one ledger of rows (M-05 d3 — "one combined list …
 * because what is owed is the net of both").
 *
 * The screen reads rows from here and nothing else, so the arithmetic behind
 * a figure lives in one place rather than in a component.
 */

export type RowKind = "invoice" | "entry" | "claim";

/**
 * d14/d26/d27 — the three things a row can be, and the reason a Claim
 * placeholder is neither: it contributes NOTHING to the money, ever, which is
 * what makes it safe to tick into a settlement.
 */
export type RowRole = "debit" | "credit" | "placeholder";

/** The bands. d14 draws the only real line: counted, or not counted yet. */
export type RowBand = "counted" | "uncounted" | "settled";

export interface LedgerRow {
  key: string;
  kind: RowKind;
  id: string;
  type: string;
  reference: string;
  sub?: string;
  /** The date terms run from (E-02 d45 — the INVOICE date, not the received date). */
  termsFrom: string;
  amount: number;
  /** d29 — a Claim placeholder's OTHER figure: face value, which d15's test sums. */
  face: number;
  netted: number | null;
  /** What this row contributes to the balance right now. */
  balance: number;
  status: string;
  band: RowBand;
  role: RowRole;
  source?: PayableEntrySource;
  /** Which credit this row IS, for attaching (A-37 derives consumption from targets). */
  creditId?: string;
  /** Terms and the derived due date — only a bill has one. */
  terms?: PaymentTerms;
  dueDate?: string;
  /** Days past due. Negative = not yet due. Undefined = nothing to age. */
  overdueBy?: number;
  /** E-04 d20 — what was claimed, when the memo granted less. */
  claimed?: number;
  canOpenInReceiving?: boolean;
  isPaidInvoice?: boolean;
}

export interface PayablesData {
  invoices: Invoice[];
  payableEntries: PayableEntry[];
  claims: SupplierClaim[];
  paymentBatches: PaymentBatch[];
  batchVoids: PaymentBatchVoid[];
}

const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const daysBetween = (iso: string, today: Date): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((today.getTime() - new Date(y, m - 1, d).getTime()) / 86400000);
};

/**
 * E-02 d45 — due date is `invoice date + terms`, and the Invoice's own terms
 * win over the Supplier's default because the paperwork in hand is the
 * agreement. COD and Prepaid produce no due date at all.
 */
export function dueFor(
  terms: PaymentTerms | undefined,
  termsFrom: string,
  today: Date,
): { terms?: PaymentTerms; dueDate?: string; overdueBy?: number } {
  if (!terms) return {};
  const days = TERM_DAYS[terms];
  if (days == null) {
    // COD / Prepaid: no due date. Still worth knowing how long it has sat.
    return { terms, overdueBy: daysBetween(termsFrom, today) };
  }
  const dueDate = addDays(termsFrom, days);
  return { terms, dueDate, overdueBy: daysBetween(dueDate, today) };
}

/** Everything on one supplier's ledger, banded. `live` excludes what has been retired. */
export function ledgerRows(
  supplierId: string,
  data: PayablesData,
  suppliers: Supplier[],
  today = new Date(),
): LedgerRow[] {
  const { invoices, payableEntries, claims, paymentBatches: b, batchVoids: v } = data;
  const supplier = suppliers.find((s) => s.id === supplierId);
  const rows: LedgerRow[] = [];

  for (const iv of invoices.filter((i) => i.supplierId === supplierId && i.status !== "Draft")) {
    const balance = invoiceBalance(iv, b, v);
    const paid = invoiceIsPaid(iv, b, v);
    const terms = iv.paymentTerms ?? supplier?.paymentTerms;
    rows.push({
      key: `invoice:${iv.id}`,
      kind: "invoice",
      id: iv.id,
      type: supplier?.consignment ? "Consignment" : "Invoice",
      reference: iv.invoiceNumber,
      termsFrom: iv.invoiceDate,
      amount: invoiceTotal(iv),
      face: balance,
      netted: invoicePaidToDate(iv, b, v),
      balance,
      status: paid ? "Paid" : invoicePaidToDate(iv, b, v) > 0.005 ? "Part paid" : "Open",
      band: paid ? "settled" : "counted",
      role: "debit",
      canOpenInReceiving: true,
      isPaidInvoice: paid,
      ...dueFor(terms, iv.invoiceDate, today),
    });
  }

  // d26 — a Credited claim counts; a Pending one does not. The line is
  // agreed-vs-not-agreed, not claim-vs-entry.
  for (const c of claims.filter((x) => x.supplierId === supplierId && claimIsAgreed(x))) {
    if (creditIsConsumed(c.id, b, v)) continue;
    const amount = claimCreditAmount(c);
    const asked = claimTotal(c);
    rows.push({
      key: `claim:${c.id}`,
      kind: "claim",
      id: c.id,
      type: "Credit",
      reference: c.claimNumber != null ? `#${c.claimNumber}${c.creditMemo ? ` · ${c.creditMemo}` : ""}` : "Unsent",
      sub: c.lines[0]?.reason,
      termsFrom: c.createdAt.slice(0, 10),
      amount,
      face: -amount,
      netted: null,
      balance: -amount,
      status: asked > amount + 0.005 ? "Credited short" : "Credited",
      band: "counted",
      role: "credit",
      creditId: c.id,
      claimed: asked > amount + 0.005 ? asked : undefined,
    });
  }

  for (const e of payableEntries.filter((x) => x.supplierId === supplierId && !x.clearedAt)) {
    const payable = payableEntryIsPayable(e);
    const contribution = payableEntryContribution(e, b, v);
    const isPlaceholder = e.type === "Claim";
    const isCredit = e.type === "Credit";
    if (isCredit && creditIsConsumed(e.id, b, v)) continue;
    const balance = payable ? payableEntryBalance(e, b, v) : contribution;
    if (payable && balance <= 0.005) continue; // settled — its batch carries the history
    const terms = payable && (e.type === "Invoice" || e.type === "Consignment") ? supplier?.paymentTerms : undefined;
    rows.push({
      key: `entry:${e.id}`,
      kind: "entry",
      id: e.id,
      type: e.type,
      reference: e.reference || "—",
      sub:
        e.source === "remainder"
          ? "remainder — not a manual entry (d25)"
          : e.source === "reversal"
            ? "reversal of a remainder — posted by a void (d30)"
            : "entered by hand",
      termsFrom: e.date,
      amount: payableEntryTotal(e),
      face: payableEntrySignedAmount(e),
      netted: payable ? payableEntryPaidToDate(e, b, v) : null,
      balance: isPlaceholder ? 0 : balance,
      status: isPlaceholder
        ? "Awaiting credit"
        : e.source === "remainder"
          ? "Credit in our favour"
          : e.source === "reversal"
            ? "Reverses a remainder"
            : payable
              ? payableEntryPaidToDate(e, b, v) > 0.005
                ? "Part paid"
                : "Open"
              : "Applied",
      band: isPlaceholder ? "uncounted" : "counted",
      role: isPlaceholder ? "placeholder" : isCredit ? "credit" : "debit",
      source: e.source,
      creditId: isCredit ? e.id : undefined,
      ...dueFor(terms, e.date, today),
    });
  }

  return rows.sort((x, y) => x.termsFrom.localeCompare(y.termsFrom));
}

/** What is placed on one debit. An untouched money box means "the rest". */
export const creditOn = (form: { credit: Record<string, string> }, key: string): number =>
  Number(form.credit[key] ?? 0) || 0;
export const moneyOn = (
  form: { credit: Record<string, string>; money: Record<string, string> },
  key: string,
  balance: number,
): number =>
  form.money[key] !== undefined
    ? Number(form.money[key]) || 0
    : Math.max(0, Math.round((balance - creditOn(form, key)) * 100) / 100);

export interface SettlementPlan {
  rows: LedgerRow[];
  debits: LedgerRow[];
  credits: LedgerRow[];
  holds: LedgerRow[];
  debitTotal: number;
  creditTotal: number;
  /** d27 — credits attach to the debits in the SAME selection; no further. */
  attach: number;
  /** What money has to cover. */
  money: number;
  /** d25/d28 — what cannot attach comes back as its own artifact. */
  remainder: number;
  /** d27 — no debit means nothing to attach to: this is d15's clearing. */
  isClearing: boolean;
}

export function settlementPlan(rows: LedgerRow[]): SettlementPlan {
  const debits = rows.filter((r) => r.role === "debit" && r.balance > 0.005);
  const credits = rows.filter((r) => r.role === "credit");
  const holds = rows.filter((r) => r.role === "placeholder");
  const debitTotal = round2(debits.reduce((n, r) => n + r.balance, 0));
  const creditTotal = round2(credits.reduce((n, r) => n - r.balance, 0));
  const attach = round2(Math.min(creditTotal, debitTotal));
  return {
    rows,
    debits,
    credits,
    holds,
    debitTotal,
    creditTotal,
    attach,
    money: round2(debitTotal - attach),
    remainder: round2(creditTotal - attach),
    isClearing: debits.length === 0 && rows.length > 0,
  };
}

/** d15's test sums FACE values (d29), which is why a placeholder has two figures. */
export const clearsToZero = (rows: LedgerRow[]): boolean =>
  rows.length >= 2 && Math.abs(round2(rows.reduce((n, r) => n + r.face, 0))) <= 0.005;
