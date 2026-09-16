import type {
  ClaimVoid,
  Invoice,
  PayableEntry,
  PayableEntrySource,
  PaymentBatch,
  PaymentBatchVoid,
  PaymentMethod,
  PaymentTerms,
  Supplier,
  SupplierClaim,
} from "../data/types";
import { TERM_RULE } from "../data/types";
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
export type RowRole = "debit" | "credit" | "placeholder" | "counter";

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
  /** Which credit this row IS, for attaching. Not the retired pairing: A-37/A-69
   *  derive consumption from the BATCH naming the credit, not from a target. */
  creditId?: string;
  /** Terms and the derived due date — only a bill has one. */
  terms?: PaymentTerms;
  dueDate?: string;
  /** Days past due. Negative = not yet due. Undefined = nothing to age. */
  overdueBy?: number;
  /** E-04 d20 — what was claimed, when the memo granted less. */
  claimed?: number;
  /** E-02 d47 — how this one was EXPECTED to be paid. M-05 d34 pre-fills from it. */
  method?: PaymentMethod;
  canOpenInReceiving?: boolean;
  isPaidInvoice?: boolean;
  /**
   * M-05 d43 — when this row was ticked. Set by the screen on a selected
   * row, not by `ledgerRows`. Credits draw down in this order, so it is what
   * decides which credit overflows into a remainder. Debits ignore it and
   * keep ledger order, which is what d33 governs.
   */
  tickOrder?: number;
}

export interface PayablesData {
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

const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

/** M-01 d20 — the last day of the month the invoice is dated in. */
const endOfMonth = (iso: string): string => {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 of the next month
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
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
  const rule = TERM_RULE[terms];
  if (rule.kind === "none") {
    // COD / Prepaid: no due date. Still worth knowing how long it has sat.
    return { terms, overdueBy: daysBetween(termsFrom, today) };
  }
  const dueDate = rule.kind === "eom" ? endOfMonth(termsFrom) : addDays(termsFrom, rule.days);
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
      method: iv.paymentMethod ?? supplier?.defaultPaymentMethod,
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
      // d30 — a REVERSAL is a counterweight, not a bill. It exists only to
      // cancel the remainder a void could not delete, and d30 says the pair is
      // "marked Cleared against each other under d15". Calling it a debit would
      // offer to write a cheque against it, which nobody would ever do.
      role: isPlaceholder ? "placeholder" : isCredit ? "credit" : e.source === "reversal" ? "counter" : "debit",
      source: e.source,
      creditId: isCredit ? e.id : undefined,
      ...dueFor(terms, e.date, today),
    });
  }

  return rows.sort((x, y) => x.termsFrom.localeCompare(y.termsFrom));
}

/** What is placed on one debit. An untouched money box means "the rest". */
/** d33 — credit placement is never typed, so this reads only the computed fill. */
export const creditOn = (
  _form: unknown,
  key: string,
  auto?: Record<string, number>,
): number => auto?.[key] ?? 0;
export const moneyOn = (
  form: { credit: Record<string, string>; money: Record<string, string> },
  key: string,
  balance: number,
  auto?: Record<string, number>,
): number =>
  form.money[key] !== undefined
    ? Number(form.money[key]) || 0
    : Math.max(0, Math.round((balance - creditOn(form, key, auto)) * 100) / 100);

export interface SettlementPlan {
  rows: LedgerRow[];
  debits: LedgerRow[];
  credits: LedgerRow[];
  holds: LedgerRow[];
  /** d30 — reversals: counterweights that can only be cleared, never settled. */
  counters: LedgerRow[];
  debitTotal: number;
  creditTotal: number;
  /** d27 — credits attach to the debits in the SAME selection; no further. */
  attach: number;
  /** What money has to cover. */
  money: number;
  /** d25/d28 — what cannot attach comes back as its own artifact. */
  remainder: number;
  /**
   * d43 — per credit, in tick order: what it applied and what is left. The
   * one with `touched` and a non-zero `left` is the credit being partly
   * applied, and the summary has to name it before the Manager commits.
   */
  drawdown: { id: string; drawn: number; left: number; touched: boolean }[];
  /** d27 — no debit means nothing to attach to: this is d15's clearing. */
  isClearing: boolean;
}

/**
 * M-05 d27 — "credits in the selection attach to the debits in the selection;
 * whatever cannot attach STAYS AS IT WAS." A credit the drawdown never reaches
 * is therefore not part of the settlement at all: it is not consumed, and it
 * emits no remainder.
 *
 * d28's "every credit consumed by a settlement is consumed whole" governs the
 * credits the drawdown DID reach — in practice the one it straddles. Reading it
 * as "every credit ticked" is what produced the double count this replaces: an
 * untouched credit emitted a remainder for its full value while staying
 * un-consumed, so the entry and its remainder both reduced the balance, moving
 * it by money nobody paid and no agreement granted. d26 forbids exactly that.
 *
 * The order is the order given. d43 makes that tick order and is separate work.
 */
export function creditDrawdown(
  credits: { id: string; amount: number }[],
  attach: number,
): { id: string; drawn: number; left: number; touched: boolean }[] {
  let pool = round2(attach);
  return credits.map((c) => {
    const drawn = round2(Math.min(pool, round2(c.amount)));
    pool = round2(pool - drawn);
    return { id: c.id, drawn, left: round2(round2(c.amount) - drawn), touched: drawn > 0.005 };
  });
}

export function settlementPlan(rows: LedgerRow[]): SettlementPlan {
  const debits = rows.filter((r) => r.role === "debit" && r.balance > 0.005);
  // d43 — tick order, because the Manager already expressed it and can change
  // it by re-ticking. Explicitly NOT oldest-first, which is what ledger order
  // gives and which is d11's automatic distribution on a second axis (d18).
  const credits = rows
    .filter((r) => r.role === "credit")
    .sort((a, b) => (a.tickOrder ?? 0) - (b.tickOrder ?? 0));
  const holds = rows.filter((r) => r.role === "placeholder");
  const counters = rows.filter((r) => r.role === "counter");
  const debitTotal = round2(debits.reduce((n, r) => n + r.balance, 0));
  const creditTotal = round2(credits.reduce((n, r) => n - r.balance, 0));
  const attach = round2(Math.min(creditTotal, debitTotal));
  const drawdown = creditDrawdown(
    credits.map((c) => ({ id: c.key, amount: -c.balance })),
    attach,
  );
  return {
    rows,
    debits,
    credits,
    holds,
    counters,
    debitTotal,
    creditTotal,
    attach,
    money: round2(debitTotal - attach),
    // d27 — only a credit the drawdown reached can leave a remainder behind.
    // `creditTotal - attach` counted untouched credits too, which is the figure
    // the store then emitted artifacts for.
    remainder: round2(drawdown.filter((c) => c.touched).reduce((n, c) => n + c.left, 0)),
    drawdown,
    isClearing: debits.length === 0 && rows.length > 0,
  };
}

/**
 * Where the credit lands across the debits the Manager ticked.
 *
 * d33 — the choice d18 gives the Manager is WHICH Invoices, made by selecting
 * them. Inside that set the credit simply fills, in the order the rows are
 * listed. That is not d11 returning: d11 chose the Invoices itself, with no
 * Manager input at all, and that stays retired. Filling a set someone chose is
 * arithmetic. If they want the credit on one Invoice, they tick one Invoice.
 */
export function autoPlacement(plan: SettlementPlan): Record<string, number> {
  const out: Record<string, number> = {};
  let left = plan.attach;
  for (const d of plan.debits) {
    const take = Math.round(Math.min(left, d.balance) * 100) / 100;
    out[d.key] = take;
    left = Math.round((left - take) * 100) / 100;
  }
  return out;
}

/**
 * M-05 d34 — the method a settlement starts on. Offered only where every ticked
 * debit expects the same one; where they disagree, or nothing carries one, this
 * returns undefined and the field opens empty rather than picking a winner.
 * Guessing whose habit should govern a mixed cheque run is the quiet inference
 * d18 retired elsewhere in this flow.
 */
export function suggestedMethod(plan: SettlementPlan): PaymentMethod | undefined {
  const seen = new Set(plan.debits.map((d) => d.method).filter(Boolean) as PaymentMethod[]);
  return seen.size === 1 ? [...seen][0] : undefined;
}

/** d15's test sums FACE values (d29), which is why a placeholder has two figures. */
export const clearsToZero = (rows: LedgerRow[]): boolean =>
  rows.length >= 2 && Math.abs(round2(rows.reduce((n, r) => n + r.face, 0))) <= 0.005;
