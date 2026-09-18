import type {
  GLAccount,
  GLMapping,
  Genre,
  InventoryItem,
  JournalBatch,
  RecordEntry,
  Sale,
  SaleLine,
  SectionRow,
  Tender,
  TenderRow,
} from "../data/types";
import { assembleJournal, credit, debit, roleAccount, seamAccount, type Posting } from "./journal";
import { sectionRowFor } from "./taxonomy";
import { defaultTenderRow } from "./tenders";
import { lineNet, lineTaxComponents, type TaxContext } from "./totals";

/**
 * M-07 d7, d9, d14 — the journal a close writes.
 *
 * One batch per CloseBatch, riding alongside the summary M-03 d13 already
 * stores there, and grouped by `(business date, account)` rather than by
 * account alone — because M-03 step 2 closes ALL Current Sales, not today's,
 * so a close nobody ran on Monday sweeps Monday and Tuesday into one batch.
 *
 * Sales are the only thing in this system that batches. d12: everything else
 * writes its own journal as it happens, because everything else already IS a
 * batch — one immutable, dated, numbered artifact arriving a few times a week
 * rather than a few hundred times a day.
 */

// ---------------------------------------------------------------------------
// A Sale's business date (d19)
// ---------------------------------------------------------------------------

/**
 * d19 — a business day is a calendar day ending at midnight, and a Sale's
 * business date is the calendar date of its TENDER (E-05 step 12), which is the
 * moment A-57 already resolves tax at. A shop trading past midnight files those
 * Sales on the following day, and that is accepted rather than worked around.
 *
 * The fallback chain exists because Sales seeded before `tenderedAt` was a
 * field carry the moment only in their log. Reading log prose is what E-04 d25
 * refused and is a fallback rather than the rule.
 */
export function businessDateOf(sale: Sale): string {
  const at =
    sale.tenderedAt ??
    sale.log.find((e) => e.text.startsWith("Tendered —"))?.at ??
    sale.createdAt;
  return at.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Which configured tender a Sale's tender was
// ---------------------------------------------------------------------------

/**
 * **A finding, written here because this is where it bites.**
 *
 * M-06 d22 and M-07 d21 both turn on one account PER TENDER: *"Visa and Amex
 * settle as separate deposits, and a breakdown that merges them cannot be tied
 * back to a bank statement."* The chart honours that — `tn-visa`, `tn-mc` and
 * `tn-debit` each get their own account.
 *
 * **A Sale's tender does not record which of them it was.** The till's pad
 * offers the seven `TenderType` BEHAVIORS, and `Tender.type` is `Credit Card`
 * for all three cards. So at the close, every card in the day lands in one
 * account — whichever row is listed first — and the reconciliation d22 exists
 * to protect is unreachable.
 *
 * The journal resolves as well as the data allows and says so, rather than
 * silently picking one: `tenderRowId` where something sets it, otherwise the
 * first ACTIVE row of the behavior, otherwise the first row at all (d18 —
 * *active* governs what is offered, never what resolves).
 *
 * Fixing it means the till offering configured rows instead of behaviors,
 * which is E-05's screen and M-06's configuration, not this flow's to decide.
 * Raised as an open question against E-05.
 */
export function tenderRowFor(t: Tender, rows: TenderRow[]): TenderRow | undefined {
  if (t.tenderRowId) {
    const exact = rows.find((r) => r.id === t.tenderRowId);
    if (exact) return exact;
  }
  // Falling back to the behaviour, for Sales recorded before the pad offered
  // rows (E-05 d36). `defaultTenderRow` excludes the system-owned rounding
  // tender for the reason d26 gives — a customer's cash must never be able to
  // land in Cash over / short — and resolves through a deactivated row rather
  // than refusing, per M-07 d18.
  return defaultTenderRow(t.type, rows);
}

/** True where more than one configured row shares this tender's behavior. */
export const tenderIsAmbiguous = (t: Tender, rows: TenderRow[]): boolean =>
  !t.tenderRowId && rows.filter((r) => r.behavior === t.type && !r.systemOwned).length > 1;

// ---------------------------------------------------------------------------
// Building the batch
// ---------------------------------------------------------------------------

export interface CloseJournalInput {
  /** M-08 d12, d27 / A-72 — the Store this journal belongs to. Stamped on
   *  every line, Suspense included. One value per batch, because A-72 keeps
   *  the ledger inside A-5 and a batch cannot span Stores. */
  location: string;
  batchId: string;
  writtenAt: string;
  /** The Sales this CloseBatch closed — not every Sale in the system. */
  sales: Sale[];
  records: RecordEntry[];
  inventory: InventoryItem[];
  genres: Genre[];
  sections: SectionRow[];
  tenders: TenderRow[];
  taxCtx: TaxContext;
  accounts: GLAccount[];
  mappings: GLMapping[];
  /** d17 — every line carries a code. A Sale is in the store's home currency. */
  currency: string;
}

export interface CloseJournalResult {
  batch: JournalBatch;
  /**
   * What could not be resolved. Every one of these is a defect rather than a
   * configuration hole (d11 maps every seam at setup), and each one is also a
   * reason the batch needed Suspense — so they are reported beside it rather
   * than swallowed.
   */
  unresolved: string[];
  /** Tenders whose configured row could not be told apart — see `tenderRowFor`. */
  ambiguousTenders: string[];
}

/**
 * E-05 d35 — **a pay-out funds itself, so its journal is a plain two-sided
 * entry.** Debit the pay-out expense (d21 provisions it, calling it *"the one
 * kind no reserved account covered"*), credit the cash it came out of.
 *
 * This used to be the worst thing in this file. d16 makes a pay-out *cash
 * removed from the till*, but the prototype stored it as a negative tender that
 * left the Sale owing, so the operator cleared it with an offsetting cash
 * tender — and the Sale then recorded cash that never entered the drawer, with
 * nothing saying which tender was the phantom. The journal **balanced exactly**
 * and put Cash and the expense on the wrong sides by twice the pay-out, which
 * is the failure M-07 describes under *"an imbalance and a wrong tender are
 * different failures"*. It was detected and reported rather than guessed at.
 *
 * d35 removed the cause rather than the symptom, so there is nothing left to
 * detect.
 *
 * The cash side resolves to the **Cash tender's** account, which is where the
 * drawer's money lives (d21 — `cash` takes undeposited funds). A shop that has
 * configured no cash tender at all has nowhere for it to come from, and that
 * is reported rather than assumed.
 */

export function buildCloseJournal(input: CloseJournalInput): CloseJournalResult {
  const { accounts, mappings } = input;
  const postings: Posting[] = [];
  const unresolved: string[] = [];
  const ambiguousTenders = new Set<string>();
  const cur = input.currency;

  const need = (a: GLAccount | undefined, what: string): string => {
    if (a) return a.id;
    unresolved.push(what);
    return "";
  };

  const suspense = roleAccount(accounts, "suspense");
  const inventoryAcct = roleAccount(accounts, "inventory");
  const cogsAcct = roleAccount(accounts, "cogs");
  const giftCardAcct = roleAccount(accounts, "gift-card-liability");

  for (const sale of input.sales) {
    const bd = businessDateOf(sale);
    const label = sale.saleNumber ? `Sale #${sale.saleNumber}` : "Sale";

    for (const line of sale.lines) {
      // --- Revenue, and the one thing that is not revenue -------------------
      //
      // M-06 d20 — whether a Section enters revenue is a property of the
      // Section, and the inherited note says what the ledger does with the
      // other half: "a gift card load is money received against a future
      // obligation, not a revenue bucket". So a load credits the gift card
      // LIABILITY and never a Section.
      if (line.kind === "giftcard-load") {
        postings.push(
          credit(
            need(giftCardAcct, "Gift card liability (role)"),
            bd,
            round(line.qty * line.price),
            cur,
            "Gift card liability — loaded",
          ),
        );
      } else if (line.kind === "item" || line.kind === "nontracked") {
        const genreId = line.kind === "item" ? input.records.find((r) => r.id === line.recordId)?.genreId : line.genreId;
        const section = sectionRowFor(input.genres, input.sections, genreId);
        if (!section) {
          // M-03 buckets a Section-less line under an em dash so a taxonomy
          // gap stays visible. The ledger has no em dash to post to, so the
          // gap arrives as an imbalance and Suspense reports it — which is
          // d10 working exactly as written.
          unresolved.push(`${label} — a line resolves to no Section`);
        } else {
          // d28, d29, d33 — a Section resolves by RULE wherever a rule exists.
          // Revenue goes to the ONE reserved Sales account and the Section
          // rides on the line as a dimension (M-08 d2); a Section a Manager
          // marked not-revenue keeps a mapping and must point at a liability.
          //
          // M-08 d2, d12 — the Section rides on the line as a DIMENSION, which
          // is what makes d28's single Sales account reportable: totalling
          // revenue across every Section and within one become the same query
          // with a different filter. The memo still names it for a human
          // reading the file; the dimension is what a report reads.
          const target = section.countsAsRevenue
            ? need(roleAccount(accounts, "revenue"), "Sales (role)")
            : need(seamAccount(accounts, mappings, "section", section.code), `Section ${section.name}`);
          postings.push(
            // d26 — an unmatched return posts NO revenue. `lineNet` is negative
            // on a return, so crediting it here would reduce revenue, which is
            // exactly what d26 says an unmatched one must not do: the money is
            // a purchase. The Inventory debit it gets instead is below.
            ...(line.unmatchedReturn
              ? []
              : [credit(target, bd, round(lineNet(line)), cur, `Revenue — ${section.name}`, section.code)]),
          );
        }
      }

      // --- Tax collected, per type (d5) -------------------------------------
      //
      // The COLLECTED half only. The paid half is an Input Tax Credit and
      // arrives on a supplier Invoice (E-02 d34), never here.
      for (const c of lineTaxComponents(line, input.taxCtx)) {
        if (c.amount === 0) continue;
        postings.push(
          credit(
            need(seamAccount(accounts, mappings, "tax-collected", c.code), `${c.name} collected`),
            bd,
            round(c.amount),
            cur,
            `${c.name} collected`,
          ),
        );
      }

      // --- E-06 d26 — an unmatched return BUYS the disc ---------------------
      //
      // The shop has no sold record for it, so there is nothing to reverse:
      // no revenue to give back and no cost to move out of cost of goods. What
      // happened is a purchase, and it balances as one — Inventory debited at
      // the refund paid, against the Cash the tender postings below already
      // credit. `lineNet` is negative on a return, so the debit takes its
      // absolute value.
      if (line.unmatchedReturn) {
        postings.push(
          debit(
            need(inventoryAcct, "Inventory (role)"),
            bd,
            round(Math.abs(lineNet(line))),
            cur,
            "Inventory — bought in on an unmatched return",
          ),
        );
      }

      // --- The copy's own cost (d2 — perpetual) -----------------------------
      for (const p of costPostings(line, input.inventory, bd, cur, inventoryAcct, cogsAcct, need)) postings.push(p);
    }

    // --- What the customer actually handed over ---------------------------
    //
    // Every tender DEBITS the account its behavior implies (d21). That is not
    // a choice: `balanceDue` is zero at tender, so the tenders that count
    // toward the Sale sum to its grand total, which is exactly what the credits
    // above sum to. The journal balances because the till's own arithmetic
    // balanced — and where it does not, d10's Suspense is what says so.
    //
    // The pay-out is the exception at both ends (d35): it settles nothing, so
    // it is outside that sum, and it posts both of its own sides, so it adds
    // nothing to either total.
    for (const t of sale.tenders) {
      const row = tenderRowFor(t, input.tenders);
      if (!row) {
        unresolved.push(`${label} — tender "${t.type}" matches no configured tender`);
        continue;
      }
      if (tenderIsAmbiguous(t, input.tenders)) ambiguousTenders.add(t.type);
      const acct = need(seamAccount(accounts, mappings, "tender", row.id), `Tender ${row.name}`);

      // d35 — the pay-out is its own two-sided entry, and is the one tender
      // that does not simply debit its own account by what was recorded. The
      // expense is incurred and the drawer pays for it; nothing else on the
      // Sale funds it, which is exactly why it no longer needs an offsetting
      // tender at the till.
      if (t.type === "Pay-out") {
        const amount = round(Math.abs(t.amount));
        const cashRow = input.tenders.find((r) => r.behavior === "Cash" && !r.systemOwned);
        const cashAcct = need(
          cashRow ? seamAccount(accounts, mappings, "tender", cashRow.id) : undefined,
          "a Cash tender for the pay-out to come out of",
        );
        const memo = t.note ? `Pay-out — ${t.note}` : "Pay-out";
        postings.push(debit(acct, bd, amount, cur, memo), credit(cashAcct, bd, amount, cur, memo));
        continue;
      }

      postings.push(debit(acct, bd, round(t.amount), cur, `${row.name}`));
    }
  }

  return {
    batch: assembleJournal({
      id: `jrnl-${input.batchId}`,
      // d15 — the source names the ARTIFACT, which is what makes an
      // accountant's "what is this $52" resolve to a thing rather than a shrug.
      source: `close:${input.batchId}`,
      writtenAt: input.writtenAt,
      postings,
      location: input.location,
      suspenseAccountId: suspense?.id ?? "",
    }),
    unresolved,
    ambiguousTenders: [...ambiguousTenders],
  };
}

/**
 * d2 — a copy's own cost moves from Inventory to cost of goods at the moment it
 * sells. Available because an InventoryItem is an individual row carrying its
 * own cost, which is unusual for a shop this size and is the reason gross
 * margin can be true every day rather than on count day.
 *
 * **A RETURN always reverses it, whatever E-06 step 6 then does with the copy.**
 * The copy physically came back over the counter, so d2's movement runs
 * backwards — out of cost of goods, into Inventory — and that is true before
 * anyone decides where it goes next.
 *
 * Which is what keeps the write-off case honest rather than special. Routing a
 * returned copy to `writeoff` is an **on-hand adjustment**, and d12 has an
 * adjustment write its own journal when it is made, to the account its reason
 * code maps to (d6). So the copy's cost comes back into Inventory here and
 * leaves again through `buildAdjustmentJournal` — two decided movements rather
 * than one invented one, and the write-off lands in the reason-coded account
 * d6 created for it instead of sitting silently in cost of goods.
 *
 * An unrouted return line reverses too, for the same reason: the reversal is a
 * fact about the copy coming back, not about what is done with it afterwards.
 */
function costPostings(
  line: SaleLine,
  inventory: InventoryItem[],
  bd: string,
  cur: string,
  inventoryAcct: GLAccount | undefined,
  cogsAcct: GLAccount | undefined,
  need: (a: GLAccount | undefined, what: string) => string,
): Posting[] {
  if (line.kind !== "item" || !line.inventoryItemId) return [];
  // E-06 d26 — an UNMATCHED return has no sale to reverse and no cost to move
  // back, because nothing ever paid for the disc. Its Inventory debit comes
  // from `unmatchedPostings` below, at the refund paid, and reversing a cost
  // here as well would put the copy into Inventory twice. The line's
  // `inventoryItemId` still points at the copy the Employee PICKED, which d24
  // is explicit is a different physical object.
  if (line.unmatchedReturn) return [];
  const item = inventory.find((i) => i.id === line.inventoryItemId);
  if (!item || !item.cost) return [];
  const cost = round(item.cost * Math.abs(line.qty));

  if (line.qty > 0) {
    return [
      debit(need(cogsAcct, "Cost of goods (role)"), bd, cost, cur, "Cost of goods"),
      credit(need(inventoryAcct, "Inventory (role)"), bd, cost, cur, "Inventory — sold"),
    ];
  }
  return [
    debit(need(inventoryAcct, "Inventory (role)"), bd, cost, cur, "Inventory — returned"),
    credit(need(cogsAcct, "Cost of goods (role)"), bd, cost, cur, "Cost of goods — reversed on return"),
  ];
}

const round = (n: number): number => Math.round(n * 100) / 100;
