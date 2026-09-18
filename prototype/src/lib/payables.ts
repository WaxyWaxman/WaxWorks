import type {
  ClaimVoid,
  Clearing,
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
import { isCalendarDate } from "./calendarDate";
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
  /**
   * Days past `dueDate`. Negative = not yet due. Undefined = nothing to count
   * from. **Meaningless on its own:** where there is no `dueDate` this carries
   * days since the invoice date instead — outstanding, not overdue (d52) — so
   * never call a row late without checking `dueDate`. Use `isOverdue`.
   */
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
  // M-05 d46 — cleared is derived from these, not from a mark on the entry.
  clearings: Clearing[];
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
  // Nothing to count from. An Invoice can genuinely carry no invoice date —
  // a second-hand intake has no supplier paperwork to copy one off (E-02 d39)
  // — and the arithmetic below reads the parts out of the string, so a blank
  // or any other shape yields `NaN-NaN-NaN` as the due date and `NaN` days
  // overdue. Both render: A/P shows a row dated `NaN-NaN-NaN` due `in NaNd`.
  // No date means no derived due date, which every caller already handles.
  if (!isCalendarDate(termsFrom)) return { terms };
  const rule = TERM_RULE[terms];
  if (rule.kind === "none") {
    // COD / Prepaid: no due date. Still worth knowing how long it has sat.
    return { terms, overdueBy: daysBetween(termsFrom, today) };
  }
  const dueDate = rule.kind === "eom" ? endOfMonth(termsFrom) : addDays(termsFrom, rule.days);
  return { terms, dueDate, overdueBy: daysBetween(dueDate, today) };
}

/**
 * M-05 d35 / d52 — **overdue requires a due date.** `COD` and `Prepaid` produce
 * none ([E-02] d45), so such a balance is *"outstanding without ever being
 * overdue"* (d35): it ages nowhere, and d52 puts anything with no due date in no
 * bucket. `dueFor` still returns `overdueBy` for them because how long it has sat
 * is worth knowing — which is exactly why reading `overdueBy` alone is wrong.
 * Every screen that calls a row late goes through here, so the rule is in one
 * place rather than repeated at each render site.
 */
export const isOverdue = (r: LedgerRow): boolean =>
  r.dueDate != null && r.overdueBy != null && r.overdueBy > 0;

/** Everything on one supplier's ledger, banded. `live` excludes what has been retired. */
export function ledgerRows(
  supplierId: string,
  data: PayablesData,
  suppliers: Supplier[],
  today = new Date(),
): LedgerRow[] {
  const { invoices, payableEntries, claims, paymentBatches: b, batchVoids: v, clearings } = data;
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

  // d46 — a row is off the ledger because a CLEARING names it (derived), or
  // because d27's settlement disposal stamped it. Two different acts with two
  // different reversals; only the first is un-clearable.
  for (const e of payableEntries.filter(
    (x) => x.supplierId === supplierId && !entryIsCleared(x.id, clearings) && !x.clearedAt,
  )) {
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

/**
 * M-05 d39 — why a set of rows may not be un-cleared, or undefined if it may.
 *
 * The rule, not the write, so it can be held to a test. d39 makes a CLEARING
 * reversible: it moves no money and writes no journal lines, so reversing one
 * reverses nothing real. It says nothing about d27's placeholder disposal
 * inside a settlement — that is its batch's void to reverse (d22), and whether
 * the void even does so is an open question in M-05. `clearedInBatchId` is the
 * discriminator; before it existed both acts wrote the same two fields and an
 * un-clear would have silently reversed the wrong one.
 */
/**
 * M-05 d5, d38 — what actually left the bank for this batch.
 *
 * NOT the sum of its targets. A target records what a debit was settled BY, and
 * d38 caps it at what that debit owed so the Invoice's derived balance stays at
 * zero rather than going negative (d8). The excess is a remainder Credit, so
 * the money that left is the money targets PLUS this batch's overpayment
 * remainders — derived from rows, never stored beside them.
 *
 * This is the figure d5's reference has to reconcile against: a $80.00 cheque
 * on a $68.65 Invoice is $80.00 on the statement, and a payment history saying
 * $68.65 is the one screen that must not disagree with the bank.
 */
/**
 * M-05 d41 — an earlier batch carrying this same bank reference, or undefined.
 *
 * It warns and NEVER refuses. d5 makes the reference free text on purpose,
 * because the bank's formats are not the store's to control, and one cheque
 * legitimately covering two settlements is a real thing.
 *
 * The case worth catching is not the one that raised the question. After a
 * void and a re-record (d40) the same cheque appears twice by design, and the
 * warning says so by reporting whether the match is voided. What it is really
 * for is a GENUINE double entry — the same cheque recorded twice as two live
 * settlements — which nothing else in this flow would see.
 *
 * Matching is case-insensitive and trimmed: "cheque 101" and "Cheque 101 " are
 * the same cheque to everyone except a string comparison.
 */
export function duplicateReference(
  reference: string,
  batches: PaymentBatch[],
  voids: PaymentBatchVoid[],
  excludeBatchId?: string,
): { reference: string; date: string; voided: boolean } | undefined {
  const needle = reference.trim().toLowerCase();
  if (!needle) return undefined;
  const hit = batches.find(
    (b) => b.id !== excludeBatchId && b.reference.trim().toLowerCase() === needle,
  );
  if (!hit) return undefined;
  return { reference: hit.reference, date: hit.date, voided: voids.some((v) => v.batchId === hit.id) };
}

export function batchMoneyPaid(batch: PaymentBatch, entries: PayableEntry[]): number {
  const targets = batch.targets.filter((t) => t.settleKind === "money").reduce((n, t) => n + t.amount, 0);
  const over = entries
    .filter((e) => e.source === "remainder" && e.fromBatchId === batch.id && !e.fromCreditId)
    .reduce((n, e) => n + payableEntryTotal(e), 0);
  return round2(targets + over);
}

/**
 * M-05 d46 — an entry is CLEARED because a clearing names it. Derived from the
 * artifact, never stored on the entry (architecture A-37's shape), which is
 * what lets d48 reverse a clearing by REMOVING it: the members come back by
 * the absence of the row, with nothing to flip.
 *
 * d27's settlement disposal is NOT this. It stamps the entry directly and is
 * reversed by its batch's void, never by an un-clear (A-70's conditions do not
 * reach it).
 */
export const entryIsCleared = (entryId: string, clearings: Clearing[]): boolean =>
  clearings.some((c) => c.memberIds.includes(entryId));

/**
 * M-05 d47, d48, architecture A-70 — why this clearing may not be reversed, or
 * undefined if it may.
 *
 * The rule, not the write, so it can be held to a test. Un-clearing is WHOLE
 * (d47): d15 requires the members to sum to zero, so releasing one leaves a
 * clearing that could never have been made. There is therefore no partial
 * refusal to express here — a clearing is reversible or it does not exist.
 */
/**
 * architecture A-70's fourth condition — what a clearing's member was cleared
 * AGAINST, named rather than counted.
 *
 * d48 removes the clearing, which destroys the grouping: "cleared against 2
 * other entries" does not say which two. A-70 makes naming them a CONDITION of
 * the deletion being permitted, so this is load-bearing rather than cosmetic —
 * it is the only place the act survives the row.
 */
export const clearedAgainst = (selfId: string, members: PayableEntry[]): string =>
  members
    .filter((o) => o.id !== selfId)
    .map((o) => o.reference)
    .join(", ");

export function unclearRefusal(clearing: Clearing | undefined): string | undefined {
  if (!clearing) return "That clearing no longer exists.";
  if (clearing.memberIds.length < 2) return "A clearing needs at least two members (d15).";
  return undefined;
}


/**
 * M-05 d51, d52 — aged payables for ONE Supplier, counted from the due date.
 *
 * d52: the buckets are **overdue-by**, not days-outstanding. E-02 d45 derives a
 * due date from terms, and a `Net 60` Invoice forty-five days old is not late —
 * a report calling it "45 days" sends a Manager to chase someone who is owed
 * nothing yet.
 *
 * `notAged` is load-bearing rather than a leftover. COD and Prepaid produce no
 * due date (E-02 d45), d35 says a Prepaid balance "ages nowhere", and d53
 * leaves Credits, Adjustments and Claim placeholders without one. They are
 * SHOWN, not dropped and not bucketed at zero: a figure missing from a total is
 * how a total quietly stops reconciling.
 *
 * One Supplier at a time, per d51 — the cross-supplier report belongs to the
 * surface PRD section 7 defers, and when it is built it must agree with this.
 * No currency question arises here: M-06 d35 puts currency on the Supplier, so
 * every row in one of these is already in one currency.
 */
export interface AgedBucket {
  key: "current" | "d30" | "d60" | "d90" | "over90" | "notAged";
  label: string;
  total: number;
  count: number;
}

export function agedBuckets(rows: LedgerRow[]): AgedBucket[] {
  const debits = rows.filter((r) => r.role === "debit" && r.balance > 0.005);
  const mk = (key: AgedBucket["key"], label: string, pick: (r: LedgerRow) => boolean): AgedBucket => {
    const hit = debits.filter(pick);
    return { key, label, total: round2(hit.reduce((n, r) => n + r.balance, 0)), count: hit.length };
  };
  const aged = (r: LedgerRow) => r.dueDate != null && r.overdueBy != null;
  const by = (r: LedgerRow) => r.overdueBy ?? 0;
  return [
    mk("current", "Not yet due", (r) => aged(r) && by(r) <= 0),
    mk("d30", "1–30 days", (r) => aged(r) && by(r) > 0 && by(r) <= 30),
    mk("d60", "31–60 days", (r) => aged(r) && by(r) > 30 && by(r) <= 60),
    mk("d90", "61–90 days", (r) => aged(r) && by(r) > 60 && by(r) <= 90),
    mk("over90", "Over 90 days", (r) => aged(r) && by(r) > 90),
    // d52 — no due date, so no bucket. Shown rather than dropped.
    mk("notAged", "Not aged", (r) => !aged(r)),
  ];
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
