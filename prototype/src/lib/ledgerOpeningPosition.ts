import type { GLAccount, JournalBatch, LedgerPeriodSeal, LedgerPeriodUnseal } from "../data/types";
import { accountType } from "./chart";
import { assembleJournal, type Posting } from "./journal";
import { sealedPeriods } from "./ledgerPeriods";

/**
 * M-08 Phase 1 — the opening position.
 *
 * The shop is **migrating off paper**. There is no prior system to export from,
 * so the opening figures come from the accountant's last statements. **An
 * opening position is not history** — it carries no transactions and no past
 * periods, only the balances of one day, and the years behind it stay with the
 * accountant.
 *
 * This is **the least defended surface in this system and the most
 * consequential** (M-08 Requirements). Its figures come from paper, nothing
 * validates them against the world, they may be corrected only until the first
 * seal, and **an error in them is carried forward by every period afterwards
 * without ever disagreeing with anything.** Everything below exists to narrow
 * that, and d28's read-back is the only mechanical detector there is.
 *
 * Four rules shape the module:
 *
 *   d26  — equity is NOT typed. The Manager types assets and liabilities, and
 *          equity is the figure that balances them. So the opening position
 *          cannot fail to balance, and it needs no Suspense.
 *   A-78 — equity is a DERIVATION while the position is a draft and a LINE
 *          written when it is sealed. As d26 was written it was unrepresentable:
 *          a `journal_lines` row must carry an amount and M-07 d25 requires
 *          every business date in a batch to balance, so an opening batch with
 *          no equity line does not balance as stored.
 *   d28  — the Manager types the accountant's equity figure, the system
 *          compares, and a difference must be ACKNOWLEDGED before the seal.
 *          The typed figure is never stored.
 *   d6   — retypeable until the first real period is sealed, and never after.
 */

const cents = (n: number): number => Math.round(n * 100);
const dollars = (c: number): number => c / 100;

/** The day before, which is what step 2 dates the opening position. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// What is typed, and what is not
// ---------------------------------------------------------------------------

/**
 * The opening position while it is being typed.
 *
 * `typed` holds MAGNITUDES by account, not signed amounts. The side comes from
 * the account's type — an asset is a debit, a liability is a credit — which the
 * Manager should not have to restate, because M-07 d22 already derives the type
 * from the role for exactly this reason: so a statement groups correctly after
 * the chart has been renumbered. A **negative** figure is legal and means the
 * other side: a bank account that is overdrawn is a liability wearing an asset's
 * account, and the accountant's statement will show it negative.
 *
 * `inventory` is NOT in `typed` — step 3 supplies it.
 *
 * `accountantsEquity` is d28's read-back. It is held on the draft so the screen
 * can show the comparison continuously, and it is **discarded at the seal**
 * rather than stored.
 */
export interface OpeningPositionDraft {
  /** Step 1 — the first day the books start. */
  firstDay: string;
  /** Step 3 — on hand × cost, supplied by the system and never typed. */
  inventory: number;
  /** Step 4, 5 — assets and liabilities, by account id. Magnitudes. */
  typed: Record<string, number>;
  /** d28 — compared, acknowledged, never stored. */
  accountantsEquity?: number;
  /** d28 — recorded with the seal, because it is the only record the check ran. */
  differenceAcknowledged?: boolean;
}

/** Step 2 — the opening position is dated the day before the books start. */
export const openingDateOf = (draft: OpeningPositionDraft): string => dayBefore(draft.firstDay);

// ---------------------------------------------------------------------------
// Which accounts may be typed into
// ---------------------------------------------------------------------------

/**
 * Why this account may not carry a typed opening figure, or undefined if it may.
 *
 * Four refusals, and they are four different decisions rather than one rule:
 *
 *   d9  — **no revenue or expense.** The opening position carries the balance
 *         sheet and nothing else. The asymmetry is real: a P&L is honest from
 *         day one with no opening position at all, because revenue and expense
 *         genuinely do start at the switchover; it is only the balance sheet
 *         that is wrong without one. So the first fiscal year is a stub, and
 *         *"the first annual P&L is not comparable to the years either side."*
 *
 *   d26 — **equity is not typed.** It is the figure that balances assets
 *         against liabilities, shown rather than entered. Typing it and then
 *         checking the three agree is asking a Manager to reproduce an
 *         identity. Retained earnings is equity and is refused with it.
 *
 *   d7  — ***Accounts payable* is never typed into.** The paper-era lump goes
 *         into *Accounts payable — opening*, which IS typeable and is drawn
 *         down by hand. This is the decision's whole mechanism: it buys the
 *         invariant *the Accounts payable balance **is** M-05's balance*,
 *         checkable on day one and every day after, where a single blended
 *         account is off by an unknown remainder forever.
 *
 *   d8  — **the customer side opens empty.** A customer balance is owed to a
 *         named person, so a single opening figure cannot do the job that
 *         figure exists for. The paper is run out instead (E-07 d22 rings a
 *         paper credit note as a discount). Its accepted consequence is a
 *         genuine overstatement: outstanding store credit is a real liability
 *         that will not appear on the balance sheet.
 *
 * Inventory is absent from this list because it is not refused — it is
 * **supplied** (step 3), and `inventoryRefusal` says so separately.
 */
export function untypeableInOpeningReason(account: GLAccount): string | undefined {
  if (account.role === "accounts-payable") {
    return `${account.name} is M-05's balance. Type the paper-era debts into the opening account instead (d7).`;
  }
  if (account.role === "customer-credit") {
    return `${account.name} opens empty — the paper credit notes are honoured on paper and never migrated (d8).`;
  }
  if (account.role === "inventory") {
    return `${account.name} is supplied by the system — on hand × cost (step 3).`;
  }
  if (account.role === "suspense") {
    // INFERRED. d14 refuses Suspense in an ORDINARY posting and says nothing
    // about the opening position, which is not one. But M-07 d10 is categorical
    // that a Suspense balance is "a defect in this system, never a data-entry
    // error" and that "no Manager action can create one" — and the accountant's
    // statements have no such account to copy a figure from, because Suspense
    // is this system's own. Refused here on d10's strength rather than d14's,
    // and carried as an inference because nobody has written it down.
    return `${account.name} is this system's own — there is no paper figure for it (M-07 d10).`;
  }

  const type = accountType(account);
  if (type === "income" || type === "expense" || type === "cogs") {
    return `The opening position carries the balance sheet only — no revenue or expense (d9).`;
  }
  if (type === "equity") {
    return `Equity is not typed. It is the figure that balances the rest (d26).`;
  }
  return undefined;
}

/** What the opening-position form offers a figure for. */
export const openableAccounts = (accounts: GLAccount[]): GLAccount[] =>
  accounts.filter((a) => a.active && untypeableInOpeningReason(a) === undefined);

// ---------------------------------------------------------------------------
// d26, A-78 — the balancing figure
// ---------------------------------------------------------------------------

/**
 * The signed cents a typed magnitude contributes: an asset debits, a liability
 * credits. Derived from the account's type (M-07 d22) and never from its
 * number, which d3 makes the store's to change.
 */
function signedCents(account: GLAccount, magnitude: number): number {
  const type = accountType(account);
  return type === "liability" || type === "equity" ? -cents(magnitude) : cents(magnitude);
}

export interface OpeningBalance {
  assets: number;
  liabilities: number;
  /**
   * d26 — the figure that balances, and it is **shown rather than entered**.
   * Positive means the shop has positive worth, which is the ordinary case.
   */
  equity: number;
}

/**
 * d26 — assets less liabilities, which IS equity, definitionally.
 *
 * Step 3's consequence falls out of this rather than being a separate rule:
 * where the counted inventory disagrees with the accountant's figure, **the
 * counted figure wins and the difference falls into equity** — because equity
 * is whatever is left over, so a different inventory figure simply produces a
 * different leftover. There is no reconciliation step and nothing to write.
 */
export function openingBalance(
  draft: OpeningPositionDraft,
  accounts: GLAccount[],
): OpeningBalance {
  let assetCents = 0;
  let liabilityCents = 0;

  const add = (account: GLAccount, magnitude: number) => {
    const c = signedCents(account, magnitude);
    if (c >= 0) assetCents += c;
    else liabilityCents += -c;
  };

  const inventory = accounts.find((a) => a.role === "inventory");
  if (inventory) add(inventory, draft.inventory);

  for (const [id, magnitude] of Object.entries(draft.typed)) {
    const account = accounts.find((a) => a.id === id);
    if (account) add(account, magnitude);
  }

  return {
    assets: dollars(assetCents),
    liabilities: dollars(liabilityCents),
    equity: dollars(assetCents - liabilityCents),
  };
}

// ---------------------------------------------------------------------------
// d28 — the read-back, which is the only mechanical detector there is
// ---------------------------------------------------------------------------

export interface EquityReadBack {
  /** d26's balancing figure. */
  derived: number;
  /** What the Manager typed off the accountant's statement. Never stored. */
  typed?: number;
  difference: number;
  agrees: boolean;
  /** Whether a difference has been acknowledged (d28). */
  acknowledged: boolean;
}

/**
 * d28 — compare the derived equity against a figure the accountant supplied
 * independently.
 *
 * **It does not need to be right, it needs to disagree.** d26's accepted
 * consequence was the worst-defended thing in this flow: *a typo in an asset
 * silently becomes equity*, and nothing anywhere could ever detect it. Type
 * inventory as $612,000 instead of $61,200 and the books balance perfectly
 * around half a million dollars of invented worth. A second, independently
 * sourced number is the only mechanical check available.
 *
 * **Acknowledged rather than refused**, on A-28a's house preference: the paper
 * sometimes genuinely does not balance, and a Manager who can explain the
 * difference must be able to proceed.
 */
export function equityReadBack(
  draft: OpeningPositionDraft,
  accounts: GLAccount[],
): EquityReadBack {
  const derived = openingBalance(draft, accounts).equity;
  const typed = draft.accountantsEquity;
  const difference = typed === undefined ? 0 : dollars(cents(derived) - cents(typed));
  return {
    derived,
    typed,
    difference,
    agrees: typed !== undefined && cents(difference) === 0,
    acknowledged: draft.differenceAcknowledged === true,
  };
}

// ---------------------------------------------------------------------------
// What refuses a save, and what refuses the seal
// ---------------------------------------------------------------------------

export interface OpeningContext {
  accounts: GLAccount[];
  seals: LedgerPeriodSeal[];
  unseals: LedgerPeriodUnseal[];
  /** Today, for step 1's *a past date* guess. */
  today: string;
}

/**
 * Step 1 — why the first day may not be this one, or undefined if it may.
 *
 * **Both refusals are the flow's own GUESSES, not decisions.** Step 1 reads
 * *"Guess: it must be a past date and the first day of a month; unconfirmed."*
 * They are implemented because a prototype is where a guess gets looked at, and
 * they are labelled here and in their tests. Neither is settled.
 */
export function firstDayRefusal(firstDay: string, today: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDay)) return "The books need a first day.";
  // GUESS, per step 1 — unconfirmed.
  if (!firstDay.endsWith("-01")) return "The books start on the first day of a month (step 1, a guess).";
  if (firstDay > today) return "The books start on a past date (step 1, a guess).";
  return undefined;
}

/** Every reason this draft may not be saved, reported together. */
export function openingRefusals(
  draft: OpeningPositionDraft,
  ctx: OpeningContext,
): string[] {
  const out: string[] = [];

  const dayWhy = firstDayRefusal(draft.firstDay, ctx.today);
  if (dayWhy) out.push(dayWhy);

  for (const id of Object.keys(draft.typed)) {
    const account = ctx.accounts.find((a) => a.id === id);
    if (!account) {
      out.push(`${id} is not an account.`);
      continue;
    }
    const why = untypeableInOpeningReason(account);
    if (why) out.push(why);
    else if (!account.active) out.push(`${account.name} has been deactivated.`);
  }

  return out;
}

export const openingRefusal = (
  draft: OpeningPositionDraft,
  ctx: OpeningContext,
): string | undefined => {
  const all = openingRefusals(draft, ctx);
  return all.length > 0 ? all.join(" ") : undefined;
};

/**
 * d28 — why the opening position may not be sealed yet.
 *
 * Notably this does **not** include *it does not balance*: d26 makes that
 * impossible by construction, which is the decision's whole purpose. The only
 * thing the seal waits for that the save does not is the acknowledgement.
 */
export function openingSealRefusal(
  draft: OpeningPositionDraft,
  ctx: OpeningContext,
): string | undefined {
  const saveWhy = openingRefusal(draft, ctx);
  if (saveWhy) return saveWhy;

  const readBack = equityReadBack(draft, ctx.accounts);
  if (readBack.typed === undefined) {
    return "Type the equity figure from the accountant's statement before sealing (d28).";
  }
  if (!readBack.agrees && !readBack.acknowledged) {
    return `Equity works out to ${readBack.derived.toFixed(2)} and the accountant's figure is ${readBack.typed.toFixed(2)}. Acknowledge the difference of ${readBack.difference.toFixed(2)} before sealing (d28).`;
  }
  return undefined;
}

/**
 * d6 — why the opening position may no longer be unsealed and retyped.
 *
 * The window **closes at the first seal rather than after a fixed time**,
 * because that is the moment the opening figures stop being a draft nobody has
 * relied on and become what a sealed period counted forward from; moving them
 * afterwards would restate a period already ruled off, which is the harm M-07
 * d8 exists to prevent. A-33a's and A-66's shape a third time — **writable
 * until something depends on it, then never again**.
 *
 * *Accepted consequence:* a shop that seals its first month and then finds its
 * opening bank figure wrong carries a **visible correcting posting** in month
 * two rather than a clean opening position. That is the correct outcome and it
 * will still feel like a mistake to whoever reads it.
 */
export function openingUnsealRefusal(
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): string | undefined {
  const sealed = sealedPeriods(seals, unseals);
  if (sealed.length > 0) {
    return `${sealed[0]} has been sealed, so the opening position is permanent. Correct it with a dated posting like any other (d6).`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// A-78 — the draft, and the line that appears when it is sealed
// ---------------------------------------------------------------------------

/**
 * The lines a draft opening position holds — **assets and liabilities only, and
 * therefore NOT balanced**.
 *
 * A-78 is explicit that this is legitimate and bounded: *"the draft is the one
 * place in the ledger where an unbalanced set of figures legitimately exists —
 * so nothing may read a draft opening position as though it were a journal."*
 * This function is deliberately not a `JournalBatch` for that reason. The batch
 * appears only at the seal.
 */
export function draftLines(
  draft: OpeningPositionDraft,
  accounts: GLAccount[],
): Posting[] {
  const date = openingDateOf(draft);
  const out: Posting[] = [];

  const push = (account: GLAccount | undefined, magnitude: number, memo: string) => {
    if (!account) return;
    const c = signedCents(account, magnitude);
    // A zero figure is not a line. Step 2's *a line for every account* is what
    // the FORM shows; a $0.00 row in a journal is noise an accountant reads
    // before discarding, which is assembleJournal's own rule.
    if (c === 0) return;
    out.push({ accountId: account.id, businessDate: date, amount: dollars(c), currency: "CAD", memo });
  };

  push(accounts.find((a) => a.role === "inventory"), draft.inventory, "Opening inventory — on hand × cost");
  for (const [id, magnitude] of Object.entries(draft.typed)) {
    push(accounts.find((a) => a.id === id), magnitude, "Opening position");
  }
  return out;
}

/**
 * A-78 — sealing the opening position **materialises equity as a journal line**
 * and produces the batch.
 *
 * Equity is never typed and never editable afterwards except through d6's
 * window, which retypes the whole position. The batch balances by construction
 * because the equity line is exactly what is left over, so `assembleJournal`'s
 * Suspense route is unreachable here — which is the second half of what d26
 * bought: *"it removes the only place an opening position could have needed
 * Suspense, which both M-07 d10 and decision 10 refuse it."*
 *
 * `acknowledgedDifference` is d28's record, carried onto the seal because *"the
 * acknowledgement is the only record that the check ever ran."* The typed
 * figure itself is discarded, per d28.
 */
export interface SealedOpeningPosition {
  batch: JournalBatch;
  /** d28 — recorded with the seal. Undefined where the figures agreed. */
  acknowledgedDifference?: number;
}

export function sealOpeningPosition(
  draft: OpeningPositionDraft,
  accounts: GLAccount[],
  equityAccountId: string,
  suspenseAccountId: string,
  sealedAt: string,
): SealedOpeningPosition {
  const date = openingDateOf(draft);
  const { equity } = openingBalance(draft, accounts);

  const postings: Posting[] = [...draftLines(draft, accounts)];
  if (cents(equity) !== 0) {
    postings.push({
      accountId: equityAccountId,
      businessDate: date,
      // Equity credits where the shop has positive worth, which is why this is
      // negated: `equity` is stated as the ordinary positive figure a Manager
      // reads, and the journal needs its side.
      amount: -equity,
      currency: "CAD",
      memo: "Opening equity — the figure that balances (d26, A-78)",
    });
  }

  const readBack = equityReadBack(draft, accounts);

  return {
    batch: assembleJournal({
      id: `jb-opening-${draft.firstDay}`,
      source: `opening-position:${draft.firstDay}`,
      writtenAt: sealedAt,
      postings,
      suspenseAccountId,
      location: "0",
    }),
    ...(readBack.agrees || readBack.typed === undefined
      ? {}
      : { acknowledgedDifference: readBack.difference }),
  };
}
