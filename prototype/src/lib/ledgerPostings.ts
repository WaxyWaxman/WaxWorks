import type { GLAccount, JournalBatch, LedgerPeriodSeal, LedgerPeriodUnseal } from "../data/types";
import { assembleJournal, type Posting } from "./journal";
import { isSealed, periodOf } from "./ledgerPeriods";

/**
 * M-08 Phase 2 — postings a Manager types.
 *
 * Rent, utilities, bank loans, loan interest, depreciation, an owner's draw,
 * corporate tax. *"This is the phase that makes the rest of the flow honest —
 * a balance computed from a ledger that has never seen rent is not a partial
 * answer, it is a wrong one."*
 *
 * **The four invariants A-74 moves into the function and out of the screen**,
 * on A-4 and A-48's terms — *a bound enforced in the client is not a bound*:
 *
 *   d10  — an unbalanced posting is REFUSED, and the refusal names the amount
 *          still needed and which side.
 *   d13  — retained earnings and *Accounts payable* are not typeable, and
 *          d14 — Suspense is not either. Inventory IS.
 *   A-73 — the date is bounded at both ends and unbounded above.
 *   d3   — a typed posting is editable until its period is sealed.
 *
 * They live here rather than in the screen because that is the whole of A-74's
 * argument, and the prototype has no other place that is not a screen.
 *
 * **Two of the four rest on decisions that are NOT RATIFIED.** d3 and d14 both
 * carry *"Status: recommended, not yet ratified"* and d3 says in terms *"do not
 * cite as settled"*. They are implemented here because a prototype is how a
 * proposal gets looked at, and every one of them is marked at its own function.
 * Nothing below should be read as a recorded decision.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

// Integer cents, for journal.ts's reason: d10 makes a non-zero Suspense figure
// always a defect, so a posting that balanced in reality and drifted by a
// hundredth in floating point would be refused for being binary.
const cents = (n: number): number => Math.round(n * 100);
const dollars = (c: number): number => c / 100;

// ---------------------------------------------------------------------------
// What a typed posting is
// ---------------------------------------------------------------------------

/**
 * One line of a typed posting.
 *
 * `amount` is SIGNED on journal.ts's convention — positive debits, negative
 * credits — so the two halves of this flow speak one language and a typed
 * posting reaches `assembleJournal` without translation.
 *
 * d12 — `location` is REQUIRED and defaulted from the Store; `section` is
 * optional and its blank means *not applicable* rather than *not bothered*. A
 * bank transfer, a loan repayment and an owner's draw have no section.
 *
 * Step 11 has the note per LINE rather than per posting. The flow marks that a
 * guess; it is followed here and it is still a guess.
 */
export interface TypedPostingLine {
  accountId: string;
  location: string;
  section?: string;
  amount: number;
  memo: string;
}

/**
 * What the screen holds while it is being typed, before anything accepts it.
 *
 * One business date for the whole posting (step 10), which is what makes d10's
 * per-batch balance and M-07 d25's per-date balance the same rule here. A
 * close batch can sweep two days; a Manager types one thing that happened on
 * one day.
 */
export interface PostingDraft {
  businessDate: string;
  lines: TypedPostingLine[];
}

/** A-74 — manager-only, so both names are on the artifact. */
export interface LedgerPosting extends PostingDraft {
  id: string;
  writtenAt: string;
  actorInitials: string;
  authorizedByInitials: string;
  /** d3, A-74, A-52 — appended by an edit, never overwritten. NOT RATIFIED. */
  log?: PostingEdit[];
}

export interface PostingEdit {
  editedAt: string;
  actorInitials: string;
  authorizedByInitials: string;
  /** A-74: *"the values before and after"*, on A-52's reasoning — which
   *  *"applies harder to an amount than it did to the settings it was written
   *  for."* */
  before: TypedPostingLine[];
  after: TypedPostingLine[];
}

// ---------------------------------------------------------------------------
// d10 — the balance, and what the screen shows continuously
// ---------------------------------------------------------------------------

export interface PostingBalance {
  debits: number;
  credits: number;
  /** What is still needed to balance. Zero when balanced. */
  needed: number;
  /** Which side needs it, or null when balanced. */
  side: "debit" | "credit" | null;
  balanced: boolean;
}

/**
 * Step 12 — *"the amount still needed to balance, and on which side — or
 * Balanced"*, computed continuously rather than at save.
 *
 * This is the same figure d10's refusal has to carry, so it is one function and
 * not two: d10's accepted consequence is that this is **the one place in the
 * system that blocks** rather than proceeding-and-recording (A-28a), *"so the
 * refusal has to earn it by being useful — it must name the amount still
 * needed and which side, not merely say no."* A refusal computing a different
 * number from the running indicator beside it would be worse than either.
 */
export function postingBalance(lines: TypedPostingLine[]): PostingBalance {
  let debitCents = 0;
  let creditCents = 0;
  for (const l of lines) {
    const c = cents(l.amount);
    if (c > 0) debitCents += c;
    else creditCents += -c;
  }
  const diff = debitCents - creditCents;
  return {
    debits: dollars(debitCents),
    credits: dollars(creditCents),
    needed: dollars(Math.abs(diff)),
    // A shortfall on the debit side needs a debit to close it.
    side: diff === 0 ? null : diff < 0 ? "debit" : "credit",
    balanced: diff === 0,
  };
}

/** The sentence d10 requires, or undefined when it balances. */
export function balanceRefusal(lines: TypedPostingLine[]): string | undefined {
  const b = postingBalance(lines);
  if (b.balanced) return undefined;
  return `This posting is out by ${b.needed.toFixed(2)}. It needs another ${b.needed.toFixed(2)} on the ${b.side} side.`;
}

// ---------------------------------------------------------------------------
// d13, d14 — the accounts a Manager may not type into
// ---------------------------------------------------------------------------

/**
 * Why this account may not be typed into, or undefined if it may.
 *
 * **Three roles, for three different reasons, and the reasons matter because
 * two of them are invariants and one is a proposal.**
 *
 *   `retained-earnings` (d13) — kept by the system for itself. It is derived
 *     from the P&L by the year-end seal (d17), and a typed figure makes the
 *     books disagree with themselves.
 *
 *   `accounts-payable` (d13, d7) — M-05's balance **exactly and permanently**,
 *     and *"one typed line breaks that invariant on its first use."* This is
 *     the one that would break silently and stay broken: d7 bought a checkable
 *     invariant by keeping the paper-era lump in a different account, and a
 *     single typed line spends it. The paper-era account,
 *     `accounts-payable-opening`, IS typeable — it is drawn down by hand as the
 *     old bills are paid, which is d7's whole mechanism.
 *
 *   `suspense` (d14) — **NOT RATIFIED.** M-07 d10 says *"no Manager action can
 *     create one and none can clear one"*, which was a description when only an
 *     artifact could write a journal and becomes a CHOICE once a Manager can
 *     type. d14 proposes refusing it here and giving clearing its own
 *     manager-only act carrying a reason, because the danger is not a Manager
 *     clearing a genuine Suspense balance — it is Suspense quietly becoming
 *     *"what it means in every other accounting package"*, the bucket a
 *     difference is dumped into so a posting will balance. d10 refuses that
 *     same move by a different door. The counter-argument d14 records is real:
 *     a balance nothing can ever clear leaves three dollars on the balance
 *     sheet forever.
 *
 * **Inventory is typeable, and d13 says that reverses the drafting instinct.**
 * M-07 d2's perpetual inventory makes the account's balance the sum of on-hand
 * costs — but a dead-stock write-down is precisely the case where book value
 * *should* diverge from the shelf, and forbidding it would leave a shop unable
 * to write down stock it cannot sell.
 *
 * *Current profits* is absent deliberately: M-07 d31 corrects d13 by removing
 * it from the chart entirely, so there is nothing to type into and listing it
 * would be vacuous.
 */
export function untypeableReason(account: GLAccount): string | undefined {
  switch (account.role) {
    case "retained-earnings":
      return `${account.name} is kept by the system — the year-end seal posts it (d17).`;
    case "accounts-payable":
      return `${account.name} is the payables balance exactly, so nothing is typed into it. Use the opening account (d7).`;
    case "suspense":
      // d14 — NOT RATIFIED.
      return `${account.name} is cleared by its own act, not by a posting (d14, not ratified).`;
    case "gift-card-liability":
      // _Status: recommended, not yet ratified._ Proposed by the user on
      // 2026-09-17 — a system-owned account that stays locked everywhere.
      //
      // **The argument is d13's, applied to a role d13 does not name.** d13
      // refuses *Accounts payable* because it "is M-05's balance exactly and
      // permanently" under d7, "and one typed line breaks that invariant on its
      // first use." A gift card liability is the same shape with E-06 in M-05's
      // place: the balance IS the sum of what is outstanding on live cards, and
      // a typed figure makes the books disagree with the cards.
      //
      // **What this opens is bigger than one account, and is not decided here.**
      // d13 named two roles and deliberately PERMITTED a third (Inventory, for
      // a dead-stock write-down), which reads as a considered list rather than
      // an exhaustive one. On this argument `customer-credit` (E-07),
      // `undeposited`, `tax-collected` and `tax-paid` are all the same shape and
      // none is refused today. Whether d13 is a list or a principle is a
      // question for the flow, not for this file.
      return `${account.name} is kept by the system — gift cards are issued and redeemed, never typed.`;
    default:
      return undefined;
  }
}

/**
 * What the account picker offers.
 *
 * Two filters and they are not the same rule. `untypeableReason` is d13 and
 * d14 — accounts nothing may ever type into. `active` is M-06 d9 and M-07 d18:
 * *"active governs what is OFFERED for new work and never what resolves."* A
 * deactivated account still resolves for a line already posted to it, and is
 * simply not offered for a new one.
 */
export const offerableAccounts = (accounts: GLAccount[]): GLAccount[] =>
  accounts.filter((a) => a.active && untypeableReason(a) === undefined);

// ---------------------------------------------------------------------------
// A-73, d11 — the date, bounded at both ends and unbounded above
// ---------------------------------------------------------------------------

/**
 * Why this date may not be posted to, or undefined if it may.
 *
 * **The bounds are two, not three** (A-73):
 *
 *   - Inside a SEALED period: refused (d11). *"The hydro bill for January
 *     arriving in February after January is sealed lands in February."* The
 *     Manager dates it in the open period instead, which is M-07 d8's
 *     post-forward rule reaching the case d8 did not have to imagine.
 *   - Before the OPENING POSITION: refused, because it would file a line in a
 *     period that does not exist.
 *   - **In the future: PERMITTED**, and A-73 calls that a deliberate choice
 *     against the tighter bound — a cheque written today against next month, a
 *     known future charge. Its bill is d30: a statement drawn *as at* a date
 *     must exclude what is dated after it, or two reports of one moment
 *     disagree.
 *
 * `openingDate` is the opening position's date — the day before the books
 * start (step 2). Undefined means there is no opening position yet, and A-73's
 * lower bound has nothing to bind: this returns no refusal, because a shop
 * typing before it has migrated is a different problem and not this one's to
 * invent.
 */
export function dateRefusal(
  businessDate: string,
  openingDate: string | undefined,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return "A posting needs a date.";

  if (openingDate && businessDate <= openingDate) {
    return `The books start after ${openingDate}. Nothing can be dated on or before the opening position.`;
  }

  const period = periodOf(businessDate);
  if (isSealed(period, seals, unseals)) {
    return `${period} is sealed. Date this in the open period instead (d11).`;
  }

  // Future dates are permitted (A-73). Deliberately no check.
  return undefined;
}

// ---------------------------------------------------------------------------
// The whole refusal
// ---------------------------------------------------------------------------

export interface PostingContext {
  accounts: GLAccount[];
  /** The opening position's date, or undefined before there is one. */
  openingDate?: string;
  seals: LedgerPeriodSeal[];
  unseals: LedgerPeriodUnseal[];
  /** d12 — the locations a line may carry. A-72 makes this the Store, alone. */
  locations: string[];
  /** d12 — a section is optional, but a named one has to exist. */
  sections: string[];
}

/**
 * Every reason this posting is refused, reported TOGETHER.
 *
 * Step 17 has the seal *"report every failure without sealing"* rather than
 * stopping at the first, and a posting deserves the same: a Manager who fixes
 * the date only to be told about the location has been made to do the work
 * twice for no reason.
 *
 * The empty-posting refusal is **inferred, not recorded**. Nothing in M-08
 * says a posting needs a line; a posting with none balances trivially at zero
 * and is plainly not a posting. Named here so it is visible as an inference.
 */
export function postingRefusals(draft: PostingDraft, ctx: PostingContext): string[] {
  const out: string[] = [];

  const dateWhy = dateRefusal(draft.businessDate, ctx.openingDate, ctx.seals, ctx.unseals);
  if (dateWhy) out.push(dateWhy);

  // Inferred — see above.
  if (draft.lines.length === 0 || draft.lines.every((l) => cents(l.amount) === 0)) {
    out.push("A posting needs at least one line with an amount.");
  }

  for (const [i, line] of draft.lines.entries()) {
    const n = i + 1;
    const account = ctx.accounts.find((a) => a.id === line.accountId);
    if (!account) {
      out.push(`Line ${n} has no account.`);
    } else {
      const why = untypeableReason(account);
      if (why) out.push(`Line ${n}: ${why}`);
      // M-06 d9, M-07 d18 — not offered for new work.
      else if (!account.active) out.push(`Line ${n}: ${account.name} has been deactivated.`);
    }

    // d12 — required, and defaulted from the Store, so a blank one is a bug in
    // the screen rather than something a Manager chose.
    if (!line.location) out.push(`Line ${n} has no location.`);
    else if (!ctx.locations.includes(line.location)) {
      out.push(`Line ${n}: ${line.location} is not a location.`);
    }

    // d12 — optional, but a named section has to be a real one. Step 17 lists
    // an invalid section beside an invalid account for the seal; the same
    // check at write time means the seal never has to find one.
    if (line.section && !ctx.sections.includes(line.section)) {
      out.push(`Line ${n}: ${line.section} is not a section.`);
    }
  }

  const balanceWhy = balanceRefusal(draft.lines);
  if (balanceWhy) out.push(balanceWhy);

  return out;
}

/** Undefined when the posting may be saved. */
export const postingRefusal = (draft: PostingDraft, ctx: PostingContext): string | undefined => {
  const all = postingRefusals(draft, ctx);
  return all.length > 0 ? all.join(" ") : undefined;
};

// ---------------------------------------------------------------------------
// d3 — editability. NOT RATIFIED.
// ---------------------------------------------------------------------------

/**
 * _Status: recommended, not yet ratified (d3). Do not cite as settled._
 *
 * Why this posting may not be edited, or undefined if it may.
 *
 * d3 proposes that editability is **asymmetric**: a posting a Manager typed is
 * editable until its period is sealed; a line the system wrote is never
 * editable and is corrected by posting forward (M-07 d8). The argument is that
 * a system-written line is covered by A-67 — same transaction as its artifact,
 * *"so that an artifact and its journal can never disagree"* — and editing one
 * is exactly the divergence A-67 exists to prevent, while a typed posting has
 * no artifact to disagree with, so the same protection buys nothing and costs
 * the Manager a reversing entry for every typo.
 *
 * **The prototype makes d3 look easier than it is, and that is worth saying.**
 * d3's accepted consequence is that *"two rules govern one table"*, so *can I
 * edit this line* stops being answerable from the line alone and needs its
 * origin. Here a typed posting is its own type and an artifact journal is a
 * `JournalBatch`, so the origin is structural and the question never arises.
 * In the product both are rows in `journal_lines` and it does. A walk of this
 * screen is therefore **not** evidence that d3 is cheap to enforce.
 */
export function editRefusal(
  posting: LedgerPosting,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): string | undefined {
  const period = periodOf(posting.businessDate);
  if (isSealed(period, seals, unseals)) {
    return `${period} is sealed. Correct this by posting forward to the day you made the correction (M-07 d8).`;
  }
  return undefined;
}

/**
 * d3, A-74 — the edit, which APPENDS its before and after rather than
 * overwriting. A-52's reasoning: *"a money rule nobody is recorded as having
 * changed is worse than a money rule in code."*
 *
 * NOT RATIFIED, with `editRefusal`.
 */
export function applyEdit(
  posting: LedgerPosting,
  after: TypedPostingLine[],
  edit: Omit<PostingEdit, "before" | "after">,
): LedgerPosting {
  return {
    ...posting,
    lines: after,
    log: [...(posting.log ?? []), { ...edit, before: posting.lines, after }],
  };
}

// ---------------------------------------------------------------------------
// Step 15 — the posting joins the journal beside everything the artifacts wrote
// ---------------------------------------------------------------------------

/**
 * The journal a typed posting writes.
 *
 * **This deliberately does not lean on `assembleJournal`'s Suspense route.**
 * That function *"never fails and never refuses"* — it puts any difference into
 * Suspense so an artifact's transaction can always commit, which is A-67's
 * whole reason for Suspense existing. A typed posting must never reach it:
 * d10 refuses an unbalanced posting precisely so that M-07 d10's *"always a
 * defect in this system, never a data-entry error"* stays true now that there
 * is data entry. So the balance is checked BEFORE assembly, and this throws
 * rather than assembling an unbalanced posting — a caller that skipped
 * `postingRefusal` is a bug in the caller, and a Suspense line is the one way
 * that bug would be invisible.
 *
 * `source` names the artifact, per M-07 d15, so *what is this $52* stays
 * answerable: `posting:<id>`, beside `invoice:`, `payment:` and `adjustment:`.
 */
export function postingJournal(
  posting: LedgerPosting,
  suspenseAccountId: string,
  currency: string,
): JournalBatch {
  if (!postingBalance(posting.lines).balanced) {
    throw new Error("A typed posting must balance before it is written (M-08 d10).");
  }

  const postings: Posting[] = posting.lines.map((l) => ({
    accountId: l.accountId,
    businessDate: posting.businessDate,
    amount: l.amount,
    currency,
    memo: l.memo,
    ...(l.section ? { section: l.section } : {}),
  }));

  return assembleJournal({
    id: `jb-${posting.id}`,
    source: `posting:${posting.id}`,
    writtenAt: posting.writtenAt,
    postings,
    suspenseAccountId,
    // A-72 — one value for the batch, because a batch cannot span Stores.
    location: posting.lines[0]?.location ?? "",
  });
}
