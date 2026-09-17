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
  /** M-08 d12, d27 / A-72 — the Store this journal belongs to. Stamped on
   *  every line, Suspense included. One value per batch, because A-72 keeps
   *  the ledger inside A-5 and a batch cannot span Stores. */
  location: string;
  invoice: Invoice;
  writtenAt: string;
  accounts: GLAccount[];
  /**
   * Needed since E-02 d53 recorded the tax split: a **tax-paid** account is
   * per seam (one per tax type, d5) and resolves through a mapping, where every
   * other account an Invoice touches is reserved and resolves by role (d3).
   *
   * This parameter was removed when the split was not recorded and the earlier
   * comment here said it would come back if it ever was. It has.
   */
  mappings: GLMapping[];
  /**
   * The **supplier's** currency. It no longer denominates the journal — see
   * `homeCurrency` — and survives because the rate needs a source and the memo
   * needs to say what was actually billed.
   *
   * *Amended by [M-06](../../..) d59.* M-07 d17's *"a journal line carries its
   * own currency and nothing is ever converted"* was right for a system that
   * only exported. A set of journal lines has to balance in ONE currency to be
   * double entry, and a USD payable settled from a CAD bank balances in
   * neither.
   */
  currency: string;
  /** M-06 d59 — the ledger is kept in the home currency. Every line this
   *  writes is denominated in it. */
  homeCurrency: string;
  /**
   * M-06 d59, d61 — the rate from `currency` to `homeCurrency`, taken from the
   * store's one current rate per currency (M-06 d33) at the moment of finalize
   * and **recorded on the Invoice**, which is d39's own mechanism: *"a rate
   * belongs beside the money it converted, not in a table of every rate that
   * ever was."* Nothing ever looks a past rate up, so d33's unrecoverable
   * history stops mattering. 1 for a domestic supplier.
   */
  rate: number;
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
  const { invoice: iv, accounts, mappings, homeCurrency: cur, rate } = input;
  // M-06 d59 — convert once, here, at the rate the artifact recorded. Every
  // amount below goes through this, so the whole journal is denominated in the
  // home currency and the payment that settles it can balance against it.
  const book = (n: number) => round(n * rate);
  const postings: Posting[] = [];
  const unresolved: string[] = [];
  // d14, and **A-71** — the line's own business date is the **finalize**, not
  // the date on the supplier's paperwork.
  //
  // d13 already located the economic event here: *"finalize is when the money
  // becomes real — lines become sellable inventory and the debt to the supplier
  // exists."* The first build of this function dated the lines by
  // `invoiceDate` anyway, which is a fact about the supplier's paperwork rather
  // than about when the shop's position changed. d19 set the precedent for
  // Sales by dating them at the tender, the moment the money moved.
  //
  // **What settles it is d8.** An Invoice dated 28 August and finalized 16
  // September would post lines into a month the shop may already have exported,
  // filed and had imported — the harm d8 exists to prevent, arriving as a new
  // line rather than as a restatement and doing the same damage quietly.
  //
  // The supplier's invoice date keeps its own job untouched: E-02 d45 runs
  // payment terms from it, never from the received date.
  const bd = businessDateOr(input.writtenAt, input.writtenAt, `Finalize timestamp "${input.writtenAt}"`, unresolved);

  const need = (a: GLAccount | undefined, what: string): string => {
    if (a) return a.id;
    unresolved.push(what);
    return "";
  };

  // Inventory — the copies' own costs (d2, perpetual). E-02 d16 keeps freight,
  // tax and misc at invoice level and never allocates them down to copies, so
  // this is exactly the sum of the line costs and nothing more.
  const derivedSubtotal = book(iv.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
  if (derivedSubtotal !== 0) {
    postings.push(
      debit(need(roleAccount(accounts, "inventory"), "Inventory (role)"), bd, derivedSubtotal, cur, `Inventory — ${iv.invoiceNumber}`),
    );
  }

  // Freight inbound — invoice level, never per copy (E-02 d16).
  if (iv.freight !== 0) {
    postings.push(
      debit(need(roleAccount(accounts, "freight-inbound"), "Freight inbound (role)"), bd, book(iv.freight), cur, `Freight — ${iv.invoiceNumber}`),
    );
  }

  // The labelled charges — E-02 d53, and the reason it was worth changing the
  // form rather than guessing here.
  //
  // Each charge resolves its own account from its own label: a **tax** charge
  // to that type's *paid* account (d5 — an Input Tax Credit, a receivable from
  // the government, never a cost of the goods, per E-02 d34), and a **misc**
  // charge to the reserved misc account (d23, which does reach cost of goods
  // per A-29).
  //
  // Both were `unresolved` until d53, and between them they were the whole
  // reason an ordinary Invoice raised a defect report about itself. The single
  // `tax` figure could not be split — d5 needs GST and QST apart because they
  // are separate registrations remitted to separate authorities — and computing
  // the split back from the rates would have invented a figure the paperwork
  // did not state, which is what E-02 d50 keeps the field enterable to avoid.
  // **The fix was upstream: record what the supplier's invoice already prints.**
  for (const ch of iv.charges) {
    if (ch.amount === 0) continue;
    if (ch.kind === "tax") {
      postings.push(
        debit(
          need(
            ch.taxCode ? seamAccount(accounts, mappings, "tax-paid", ch.taxCode) : undefined,
            `Tax paid ${ch.amount} — ${ch.taxCode ? `no account maps tax type "${ch.taxCode}"` : "the charge names no tax type"}`,
          ),
          bd,
          book(ch.amount),
          cur,
          `Tax paid — ${ch.taxCode ?? "?"} · ${iv.invoiceNumber}`,
        ),
      );
    } else {
      postings.push(
        debit(
          need(roleAccount(accounts, "misc-inbound"), "Miscellaneous inbound (role)"),
          bd,
          book(ch.amount),
          cur,
          `Miscellaneous — ${iv.invoiceNumber}`,
        ),
      );
    }
  }

  // Accounts payable — what is owed, tax INCLUDED (A-36: "tax included,
  // because A-29 takes tax out of cost of goods, not out of what is owed").
  // Tax is a debit above and sits inside this credit, which is the whole double
  // entry an Input Tax Credit is: the shop owes the supplier the tax and is
  // owed it back by the government.
  //
  // **Every intake raises a payable, second-hand and prepaid included** (E-02
  // d54). A counter buy is not an exception: the Manager settles it in
  // Accounts Payable drawing on *Second-hand purchases*, which is where the
  // till already put the money (M-07 d26). One shape for every intake, a
  // settlement artifact for every payment, and the same period cost left
  // behind either way — the alternative special-cased the credit side by
  // payment terms and left a counter buy with no record that it had been paid.
  const total = book(invoiceTotal(iv));
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
      location: input.location,
      suspenseAccountId: roleAccount(accounts, "suspense")?.id ?? "",
    }),
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// A PaymentBatch, at record — and its void, posting forward (d8, d12)
// ---------------------------------------------------------------------------

export interface PaymentJournalInput {
  /** M-08 d12, d27 / A-72 — the Store this journal belongs to. Stamped on
   *  every line, Suspense included. One value per batch, because A-72 keeps
   *  the ledger inside A-5 and a batch cannot span Stores. */
  location: string;
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
  /**
   * M-06 d59, d60 — the rate each targeted Invoice was **booked** at, so this
   * journal can debit Accounts payable by what it was credited rather than by
   * the figure printed on the supplier's paperwork.
   *
   * Without it the two halves do not meet: a USD 1,000 Invoice finalized at
   * 1.35 credits A/P **CAD 1,350**, and a payment clearing "1,000" would debit
   * **CAD 1,000** and leave 350 of residue that nothing ever clears. That is
   * not a rounding difference — it is the whole exchange movement, invisible.
   */
  bookedRateFor?: (targetId: string) => number;
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
  // M-06 d59 — the payable is cleared at what it was BOOKED at. A target's
  // amount is the figure on the supplier's paperwork, in the supplier's
  // currency; the ledger holds the home-currency figure the Invoice's own
  // recorded rate produced. Converting here, per target, is what makes the two
  // halves meet — and the rate comes from the artifact rather than from
  // today's table, so a rate move between finalize and payment cannot leak
  // into the clearing (A-33a's "reverse as recorded").
  // A-36 gives a target a typed `kind` and an `id`; the lookup answers 1 for
  // anything that is not a foreign Invoice, which is every domestic settlement
  // and every manual ledger entry.
  const rateFor = (t: PaymentTarget) => input.bookedRateFor?.(t.id) ?? 1;
  const paid = round(b.targets.filter(money).reduce((sum, t) => sum + t.amount * rateFor(t), 0));
  // M-06 d60 — what actually left the bank, confirmed by the Manager where the
  // Supplier's currency is not the home currency. Absent means no rate
  // movement, which for a domestic payment is a fact rather than an assumption.
  const actuallyPaid = round(b.paidAmount ?? paid);
  const fxDifference = round(actuallyPaid - paid);
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
    // A-65 — the account the payment DREW ON, named on the settlement rather
    // than inferred from the Method: "a shop paying some suppliers from one
    // chequing account and others from a second, both by cheque, is not
    // distinguishable by `Cheque`".
    //
    // It is also what lets a counter buy be settled at all. E-02 d54 raises a
    // payable for one like any other intake, and the Manager clears it drawing
    // on **Second-hand purchases**, where the till already put the money
    // (M-07 d26) — which a hardcoded bank account could not express.
    const drawnOn = b.drawnOnAccountId
      ? accounts.find((a) => a.id === b.drawnOnAccountId)
      : roleAccount(accounts, "bank");
    const bank = need(drawnOn, b.drawnOnAccountId ? `the account this payment drew on` : "Bank (role)");
    const memo = reversing ? `Void of ${b.reference}` : b.reference || "Payment";
    if (reversing) {
      postings.push(credit(ap, bd, paid, cur, memo), debit(bank, bd, actuallyPaid, cur, memo));
    } else {
      postings.push(debit(ap, bd, paid, cur, memo), credit(bank, bd, actuallyPaid, cur, memo));
    }
    // M-06 d60 — the difference IS the exchange gain or loss, and it is
    // recorded rather than computed from a rate: the bank statement is the
    // fact. A void reverses it by the same arithmetic, because `paidAmount`
    // rides on the batch (A-33a, "reverse as recorded").
    if (fxDifference !== 0) {
      const fx = need(roleAccount(accounts, "exchange-gain-or-loss"), "Exchange gain or loss (role)");
      const fxMemo = `Exchange ${fxDifference > 0 ? "loss" : "gain"} — ${b.reference || "payment"}`;
      postings.push(
        reversing
          ? credit(fx, bd, Math.abs(fxDifference), cur, fxMemo)
          : fxDifference > 0
            ? debit(fx, bd, fxDifference, cur, fxMemo)
            : credit(fx, bd, -fxDifference, cur, fxMemo),
      );
    }
  }

  return {
    batch: assembleJournal({
      id: reversing ? `jrnl-${input.reversalOf!.voidId}` : `jrnl-${b.id}`,
      source: reversing ? `payment-void:${input.reversalOf!.voidId}` : `payment:${b.id}`,
      writtenAt: input.writtenAt,
      postings,
      location: input.location,
      suspenseAccountId: roleAccount(accounts, "suspense")?.id ?? "",
    }),
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// An on-hand adjustment, when it is made (d12, d6)
// ---------------------------------------------------------------------------

export interface AdjustmentJournalInput {
  /** M-08 d12, d27 / A-72 — the Store this journal belongs to. Stamped on
   *  every line, Suspense included. One value per batch, because A-72 keeps
   *  the ledger inside A-5 and a batch cannot span Stores. */
  location: string;
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
      location: input.location,
      suspenseAccountId: roleAccount(accounts, "suspense")?.id ?? "",
    }),
    unresolved,
  };
}
