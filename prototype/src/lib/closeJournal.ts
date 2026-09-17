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
  // d26's rounding tender is system-owned and never offered at the till, so a
  // behavior match must not fall onto it: a customer's cash would post to Cash
  // over / short. Excluded from the ordinary match, and reached only by
  // `tenderRowId`, which is the one thing that names it unambiguously.
  const candidates = rows.filter((r) => r.behavior === t.type && !r.systemOwned);
  return candidates.find((r) => r.active) ?? candidates[0];
}

/** True where more than one configured row shares this tender's behavior. */
export const tenderIsAmbiguous = (t: Tender, rows: TenderRow[]): boolean =>
  !t.tenderRowId && rows.filter((r) => r.behavior === t.type && !r.systemOwned).length > 1;

// ---------------------------------------------------------------------------
// Building the batch
// ---------------------------------------------------------------------------

export interface CloseJournalInput {
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
  /**
   * Pay-outs, which this journal posts on the wrong side and cannot fix — see
   * `payoutDefect` below. Reported rather than corrected, because correcting
   * one means knowing something a Sale does not record.
   */
  payouts: { sale: string; amount: number }[];
}

/**
 * **A pay-out cannot be journalled correctly from what a Sale records.**
 *
 * E-05 d16 and the [lexicon] agree on what one is: *cash removed from the till
 * for an expense*. The correct entry is therefore **debit the pay-out expense,
 * credit the cash it came out of** — and d21 provisions exactly that, giving
 * `payout` an expense account and calling it *"the one kind no reserved account
 * covered"*.
 *
 * The till stores it as a NEGATIVE tender and makes the operator fund it with
 * an offsetting one: a $20 pay-out on an otherwise empty Sale is recorded as
 * `Pay-out -20` **and `Cash +20`**, because `balanceDue` reads $20 still owing
 * until something covers it. So the Sale records $20 of cash that never entered
 * the drawer, and nothing on it says which tender was the offset.
 *
 * What that does to the journal, on a Sale that also sold $36.20 of records:
 *
 * |  | Cash | Pay-out expense |
 * |---|---|---|
 * | What happened | debit $16.20 | debit $20 |
 * | What posts | debit $56.20 | **credit** $20 |
 *
 * **It balances exactly** — the signed tenders sum to the Sale's total by
 * construction, which is the whole reason this journal closes — and two
 * accounts are wrong by twice the pay-out. This is precisely the failure M-07
 * describes under *"An imbalance and a wrong tender are different failures"*:
 * impeccable arithmetic, money in the wrong place, Suspense at zero. The one
 * difference is that this one IS detectable, because a Pay-out tender is
 * visible on the Sale — so it is detected and reported here.
 *
 * **Not corrected here**, because correcting it means deciding which tender
 * funded the pay-out, and a Sale with two tenders does not say. That is E-05's
 * to answer — either by recording the funding tender or by storing a pay-out
 * as the negative cash line d16 already calls it. Raised as an open question.
 */
export const payoutDefect = (t: Tender): boolean => t.type === "Pay-out";

export function buildCloseJournal(input: CloseJournalInput): CloseJournalResult {
  const { accounts, mappings } = input;
  const postings: Posting[] = [];
  const unresolved: string[] = [];
  const ambiguousTenders = new Set<string>();
  const payouts: CloseJournalResult["payouts"] = [];
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
          postings.push(
            credit(
              need(seamAccount(accounts, mappings, "section", section.code), `Section ${section.name}`),
              bd,
              round(lineNet(line)),
              cur,
              `Revenue — ${section.name}`,
            ),
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

      // --- The copy's own cost (d2 — perpetual) -----------------------------
      for (const p of costPostings(line, input.inventory, bd, cur, inventoryAcct, cogsAcct, need)) postings.push(p);
    }

    // --- What the customer actually handed over ---------------------------
    //
    // Every tender DEBITS the account its behavior implies (d21). That is not
    // a choice: `balanceDue` is zero at tender, so the signed tenders sum to
    // the Sale's grand total, which is exactly what the credits above sum to.
    // The journal balances because the till's own arithmetic balanced — and
    // where it does not, d10's Suspense is what says so.
    for (const t of sale.tenders) {
      const row = tenderRowFor(t, input.tenders);
      if (!row) {
        unresolved.push(`${label} — tender "${t.type}" matches no configured tender`);
        continue;
      }
      if (tenderIsAmbiguous(t, input.tenders)) ambiguousTenders.add(t.type);
      if (payoutDefect(t)) payouts.push({ sale: label, amount: Math.abs(t.amount) });
      postings.push(
        debit(
          need(seamAccount(accounts, mappings, "tender", row.id), `Tender ${row.name}`),
          bd,
          round(t.amount),
          cur,
          `${row.name}`,
        ),
      );
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
      suspenseAccountId: suspense?.id ?? "",
    }),
    unresolved,
    ambiguousTenders: [...ambiguousTenders],
    payouts,
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
