import type {
  AdjustmentReason,
  GLAccount,
  GLMapping,
  Invoice,
  JournalBatch,
  PaymentBatch,
  PaymentTarget,
} from "../data/types";
import { assembleJournal, credit, debit, isBusinessDate, roleAccount, seamAccount, type Posting } from "./journal";
import { invoiceTotal } from "./totals";

/**
 * M-07 d12 — **a journal is written by the artifact that causes it, at the
 * moment that artifact happens.** Sales are the exception, and the exception is
 * about volume rather than principle.
 *
 * None of the three below needs batching, because each one already IS a batch:
 * one immutable, dated, numbered artifact whose journal is a fixed function of
 * it, arriving a few times a week rather than a few hundred times a day.
 *
 * So there is **no sweep, no posting queue and no month-end routine** (d12,
 * A-67), and no posted/unposted state that can be forgotten, run twice, or need
 * undoing.
 */

export interface ArtifactJournalResult {
  batch: JournalBatch;
  /**
   * What this system could not post, named. Each of these is also why the batch
   * needed Suspense, so they travel together rather than being swallowed.
   */
  unresolved: string[];
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * d24 — **a journal line's business date is a calendar date, and a line that
 * cannot produce one takes the date it was written rather than none.**
 *
 * d14 has a line carry its own business date, d19 makes it a calendar day, and
 * step 15's export gathers a range by it — three decisions resting on a field
 * nothing checked. **Suspense structurally cannot catch a bad one**, because it
 * is not an arithmetic failure: the journal balances perfectly and is filed in
 * no period at all, so a string like `10/09/2026` sorts before every real date
 * and the lines vanish from every export rather than appearing in the wrong one.
 *
 * Falling forward to the written date is d10's house style rather than a new
 * one: proceed and record, never block. A line in the wrong period is visible
 * and correctable; a line in no period is neither. The Manager is told either
 * way, because the substitution is a guess and has to read as one.
 */
function businessDateOr(raw: string, writtenAt: string, label: string, unresolved: string[]): string {
  const bd = raw.slice(0, 10);
  if (isBusinessDate(bd)) return bd;
  const fallback = writtenAt.slice(0, 10);
  unresolved.push(
    `${label} is not a calendar date (d14, d19) — these lines were filed under ${fallback}, the day the journal was written, so they are not lost from the export (d24). The date on the artifact still needs correcting.`,
  );
  return fallback;
}

// ---------------------------------------------------------------------------
// An Invoice, at finalize (d13)
// ---------------------------------------------------------------------------

export interface InvoiceJournalInput {
  invoice: Invoice;
  writtenAt: string;
  accounts: GLAccount[];
  /**
   * Every account this journal reaches is a RESERVED one, resolved by role
   * (d3), so no mapping is needed: the per-seam accounts a mapping exists for
   * are Sections, tenders, tax types and reason codes, and an Invoice touches
   * none of them. It would touch the tax-paid mappings if the tax split were
   * recorded — see the second `unresolved` below.
   */
  currency: string;
}

/**
 * d13 — **an Invoice writes its journal at finalize, not at paid.** Finalize is
 * when the money becomes real: lines become sellable inventory (E-02 step 22)
 * and the debt to the supplier exists. Waiting for paid would leave stock on
 * the shelf for the length of the supplier's terms with no Inventory and no
 * Accounts Payable behind it — books saying the shop owns nothing it has not
 * yet paid for.
 *
 * E-02 d40 leaves a finalized Invoice correctable until paid, so this journal
 * can be overtaken by a correction. That is not a reason to wait: d8 is exactly
 * the mechanism for it, and the correction posts forward as a reversing entry
 * dated when it was made.
 *
 * **Three things this cannot post, and none of them is invented around.** Each
 * lands in `unresolved`, which means the difference reaches Suspense and d10
 * says so out loud — which is the behaviour d10 was designed for.
 */
export function buildInvoiceJournal(input: InvoiceJournalInput): ArtifactJournalResult {
  const { invoice: iv, accounts, currency: cur } = input;
  const postings: Posting[] = [];
  const unresolved: string[] = [];
  // d14 — the line's own business date. An Invoice's is the date on the
  // paperwork, not the day someone got round to finalizing it.
  const bd = businessDateOr(iv.invoiceDate, input.writtenAt, `Invoice date "${iv.invoiceDate}"`, unresolved);

  const need = (a: GLAccount | undefined, what: string): string => {
    if (a) return a.id;
    unresolved.push(what);
    return "";
  };

  // Inventory — the copies' own costs (d2, perpetual). E-02 d16 keeps freight,
  // tax and misc at invoice level and never allocates them down to copies, so
  // this is exactly the sum of the line costs and nothing more.
  const derivedSubtotal = round(iv.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
  if (derivedSubtotal !== 0) {
    postings.push(
      debit(need(roleAccount(accounts, "inventory"), "Inventory (role)"), bd, derivedSubtotal, cur, `Inventory — ${iv.invoiceNumber}`),
    );
  }

  // Freight inbound — invoice level, never per copy (E-02 d16).
  if (iv.freight !== 0) {
    postings.push(
      debit(need(roleAccount(accounts, "freight-inbound"), "Freight inbound (role)"), bd, round(iv.freight), cur, `Freight — ${iv.invoiceNumber}`),
    );
  }

  // Miscellaneous — d23, its own reserved account beside freight.
  //
  // Building Phase 3 found it had none: A-29 puts it in cost of goods, and d6's
  // seams are Sections, tenders, tax types and reason codes, so **d11's
  // "nothing can be left unmapped" was complete over the seams it enumerates
  // and not over the money.** d23 closes it with a twelfth reserved role rather
  // than by widening freight, because E-02 step 6 has the two entered as
  // separate figures off the paperwork.
  if (iv.misc !== 0) {
    postings.push(
      debit(need(roleAccount(accounts, "misc-inbound"), "Miscellaneous inbound (role)"), bd, round(iv.misc), cur, `Miscellaneous — ${iv.invoiceNumber}`),
    );
  }

  // --- 2. Tax paid is one lump and d5 needs it per type --------------------
  //
  // d13 and E-02's own journal note both say **tax paid per type**, and d5 is
  // explicit that GST and QST are separate registrations remitted to separate
  // authorities, so their credits cannot share a row. But E-02 step 6 has the
  // Employee enter **one** tax figure from the supplier's paperwork, and that
  // is what an Invoice stores. The split is not recorded and is not derivable:
  // E-02 d50 leaves tax freely enterable precisely so a lump difference is
  // recorded as the charge it is, so computing it back from the rates would be
  // inventing a figure the paperwork did not state.
  if (iv.tax !== 0) {
    unresolved.push(
      `Tax paid ${iv.tax} — the Invoice records ONE tax figure (E-02 step 6) and d5 needs it per type, which is not derivable`,
    );
  }

  // --- 3. Second-hand's nominal cost has no second number ------------------
  //
  // d2 applies to both intake modes: a second-hand copy is booked at a nominal
  // figure, and **the difference between it and what was actually paid stays in
  // Second-hand purchases**. That needs two numbers — what the crate cost and
  // what the copies are booked at — and E-02's second-hand intake records one
  // cost per line and nothing else. So the account the chart provisions for it
  // has no producer, here or at the close.
  if (iv.intakeMode === "Second-hand" && Math.abs(iv.statedSubtotal - derivedSubtotal) > 0.005) {
    unresolved.push(
      `Second-hand purchases — stated ${iv.statedSubtotal} against booked ${derivedSubtotal}. d2 puts the difference here; nothing records which figure is the nominal one`,
    );
  }

  // Accounts payable — what is owed, tax INCLUDED (A-36: "tax included,
  // because A-29 takes tax out of cost of goods, not out of what is owed").
  // Which is why the lump above cannot simply be dropped: leaving it off both
  // sides would balance the journal and understate the debt, and a quiet wrong
  // figure in a liability is worse than a loud one in Suspense.
  const total = invoiceTotal(iv);
  if (total !== 0) {
    postings.push(
      credit(need(roleAccount(accounts, "accounts-payable"), "Accounts payable (role)"), bd, total, cur, `Accounts payable — ${iv.invoiceNumber}`),
    );
  }

  return {
    batch: assembleJournal({
      id: `jrnl-${iv.id}`,
      source: `invoice:${iv.invoiceNumber}`,
      writtenAt: input.writtenAt,
      postings,
      suspenseAccountId: roleAccount(accounts, "suspense")?.id ?? "",
    }),
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// A PaymentBatch, at record — and its void, posting forward (d8, d12)
// ---------------------------------------------------------------------------

export interface PaymentJournalInput {
  batch: PaymentBatch;
  writtenAt: string;
  accounts: GLAccount[];
  currency: string;
  /**
   * The void, when this is the reversing entry. d8: a correction posts FORWARD,
   * dated when it was made, and never edits the original — so a void is a
   * second journal rather than the removal of the first.
   */
  reversalOf?: { voidId: string; voidedAt: string };
}

/**
 * d12 — a PaymentBatch writes its own journal at record (M-05 d16).
 *
 * **Money targets only.** A batch carries two kinds of target (M-05 d19): money
 * and claim credit. A money target retires debt with cash, and both halves are
 * decided — debit Accounts Payable, credit the bank account it drew on (A-65).
 * A **credit** target retires debt with a supplier credit, which moves no cash
 * and whose other half was never posted: d12 names three artifacts that write
 * journals and a supplier claim is not among them, so there is no earlier entry
 * for this one to reverse. Posting the debit alone would put the difference in
 * Suspense and report a decision as a defect, so credit targets are reported
 * instead. Raised as an open question.
 */
export function buildPaymentJournal(input: PaymentJournalInput): ArtifactJournalResult {
  const { batch: b, accounts, currency: cur } = input;
  const postings: Posting[] = [];
  const unresolved: string[] = [];
  const reversing = !!input.reversalOf;

  // d8 — the reversing entry is dated WHEN IT WAS MADE, never back onto the
  // day it concerns. "This is what keeps a period that has been exported,
  // imported and filed from moving under the person who filed it."
  const raw = reversing ? input.reversalOf!.voidedAt : b.date;
  const bd = businessDateOr(raw, input.writtenAt, `Payment date "${raw}"`, unresolved);

  const need = (a: GLAccount | undefined, what: string): string => {
    if (a) return a.id;
    unresolved.push(what);
    return "";
  };

  const money = (t: PaymentTarget) => t.settleKind === "money";
  const paid = round(b.targets.filter(money).reduce((sum, t) => sum + t.amount, 0));
  const byCredit = round(b.targets.filter((t) => !money(t)).reduce((sum, t) => sum + t.amount, 0));

  if (byCredit !== 0) {
    unresolved.push(
      `${byCredit} settled by supplier credit — no journal is decided for a claim credit (d12 names three artifacts and a claim is not one)`,
    );
  }

  if (paid !== 0) {
    // A-65 — a PaymentBatch names the bank account it drew on, defaulted from
    // the Method and overridable. The prototype's PaymentBatch carries a Method
    // and a reference and NOT an account, so this resolves to the single
    // reserved bank account. A shop paying some suppliers from one chequing
    // account and others from a second, both by cheque, is exactly the case
    // A-65 says Method alone cannot answer — and exactly the case this cannot
    // tell apart until the batch carries the field.
    const ap = need(roleAccount(accounts, "accounts-payable"), "Accounts payable (role)");
    const bank = need(roleAccount(accounts, "bank"), "Bank (role)");
    const memo = reversing ? `Void of ${b.reference}` : b.reference || "Payment";
    if (reversing) {
      postings.push(credit(ap, bd, paid, cur, memo), debit(bank, bd, paid, cur, memo));
    } else {
      postings.push(debit(ap, bd, paid, cur, memo), credit(bank, bd, paid, cur, memo));
    }
  }

  return {
    batch: assembleJournal({
      id: reversing ? `jrnl-${input.reversalOf!.voidId}` : `jrnl-${b.id}`,
      source: reversing ? `payment-void:${input.reversalOf!.voidId}` : `payment:${b.id}`,
      writtenAt: input.writtenAt,
      postings,
      suspenseAccountId: roleAccount(accounts, "suspense")?.id ?? "",
    }),
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// An on-hand adjustment, when it is made (d12, d6)
// ---------------------------------------------------------------------------

export interface AdjustmentJournalInput {
  id: string;
  /** E-04's reason code, which d6 gives an account each. */
  reason: AdjustmentReason;
  /** The copies' own costs (d2). Positive takes stock OUT, negative puts it in. */
  cost: number;
  businessDate: string;
  writtenAt: string;
  memo: string;
  accounts: GLAccount[];
  mappings: GLMapping[];
  currency: string;
}

/**
 * d12 — an on-hand adjustment writes its own journal when it is made, **to the
 * account its reason code maps to** (d6).
 *
 * d6's reason for one account per code, in its own words: *"the six exist
 * because a Manager is made to choose between them, and collapsing them in the
 * ledger throws away the only thing that choice was for."* So `Shrinkage` and
 * `Found` do not share a row, and the choice survives into the books.
 *
 * Stock out debits the reason's account and credits Inventory; stock found
 * reverses it. The cost is the copy's own, for the same reason d2 gives — an
 * InventoryItem is an individual row carrying its own cost.
 */
export function buildAdjustmentJournal(input: AdjustmentJournalInput): ArtifactJournalResult {
  const { accounts, mappings, currency: cur } = input;
  const unresolved: string[] = [];
  const postings: Posting[] = [];
  const bd = input.businessDate.slice(0, 10);

  const need = (a: GLAccount | undefined, what: string): string => {
    if (a) return a.id;
    unresolved.push(what);
    return "";
  };

  const cost = round(input.cost);
  if (cost !== 0) {
    const reasonAcct = need(seamAccount(accounts, mappings, "adjustment", input.reason), `Adjustment — ${input.reason}`);
    const inv = need(roleAccount(accounts, "inventory"), "Inventory (role)");
    if (cost > 0) {
      postings.push(debit(reasonAcct, bd, cost, cur, input.memo), credit(inv, bd, cost, cur, input.memo));
    } else {
      postings.push(credit(reasonAcct, bd, -cost, cur, input.memo), debit(inv, bd, -cost, cur, input.memo));
    }
  }

  return {
    batch: assembleJournal({
      id: `jrnl-${input.id}`,
      source: `adjustment:${input.id}`,
      writtenAt: input.writtenAt,
      postings,
      suspenseAccountId: roleAccount(accounts, "suspense")?.id ?? "",
    }),
    unresolved,
  };
}
