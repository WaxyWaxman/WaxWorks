import type { GLAccount, GLMapping, GLRole, GLSeamKind, JournalBatch, JournalLine } from "../data/types";

/**
 * M-07 Phase 3 — the journal writes itself.
 *
 * This file is the machinery every journal shares: how a posting resolves to an
 * account, how postings become lines, and what happens when they do not agree.
 * The journals themselves — the close, an Invoice, a PaymentBatch, an
 * adjustment — are built on top of it, each by the artifact that causes it
 * (d12, architecture A-67).
 *
 * Three rules from the flow are structural here rather than remembered:
 *
 *   d3  — nothing resolves an account by its NUMBER. Everything below resolves
 *         by `role` or through a GLMapping, and neither ever reads `number`.
 *   d14 — a line carries its OWN business date, and lines group by
 *         `(business date, account)`. A batch is not one date.
 *   d10 — a journal that does not balance posts its difference to Suspense and
 *         says so. It never refuses to be written.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Every sum below runs in integer CENTS and converts back once, at the end.
 *
 * This is not tidiness. d10 makes a non-zero Suspense figure *always a defect
 * in this system*, so a journal that balanced in reality but drifted by a
 * hundredth in floating point would raise a bug report about itself. Summing
 * in cents means Suspense fires when the arithmetic is wrong and never when
 * the arithmetic is merely binary. (architecture A-15 keeps money in integer
 * minor units for the same reason; the prototype carries dollars as floats
 * everywhere else, so the conversion happens here.)
 */
const cents = (n: number): number => Math.round(n * 100);
const dollars = (c: number): number => c / 100;

// ---------------------------------------------------------------------------
// Resolving an account
// ---------------------------------------------------------------------------

/**
 * A reserved role resolves to exactly one account (the eleven in chart.ts's
 * RESERVED). The per-seam roles do not, and are never resolved this way —
 * they go through `seamAccount` below.
 *
 * d18 — an account that has been DEACTIVATED still resolves. *Active* governs
 * what is offered for new work and never what resolves; a Return of a copy
 * filed in a retired Section still has to post somewhere, and it posts where
 * it always did.
 */
export function roleAccount(accounts: GLAccount[], role: GLRole): GLAccount | undefined {
  return accounts.find((a) => a.role === role);
}

/** d4, d11 — the mapping lives in this flow, and every seam has one. */
export function seamAccount(
  accounts: GLAccount[],
  mappings: GLMapping[],
  kind: GLSeamKind,
  seamId: string,
): GLAccount | undefined {
  const m = mappings.find((x) => x.seamKind === kind && x.seamId === seamId);
  return m ? accounts.find((a) => a.id === m.accountId) : undefined;
}

// ---------------------------------------------------------------------------
// Postings — what a journal is assembled from
// ---------------------------------------------------------------------------

/**
 * One movement, before it is a line.
 *
 * `amount` is SIGNED: positive debits the account, negative credits it. One
 * signed number rather than a debit/credit pair because the grouping in d14
 * has to net them — a Section that sold $40 and took a $12 return on the same
 * day is one line of $28, not two lines that happen to share an account.
 *
 * The debit/credit pair reappears in `JournalLine`, which is the shape the
 * export emits and the destination expects.
 */
export interface Posting {
  accountId: string;
  businessDate: string;
  /** Positive debits, negative credits. */
  amount: number;
  currency: string;
  memo: string;
}

/** Convenience so callers read as double entry rather than as sign arithmetic. */
export const debit = (accountId: string, businessDate: string, amount: number, currency: string, memo: string): Posting =>
  ({ accountId, businessDate, amount, currency, memo });

export const credit = (accountId: string, businessDate: string, amount: number, currency: string, memo: string): Posting =>
  ({ accountId, businessDate, amount: -amount, currency, memo });

// ---------------------------------------------------------------------------
// Assembling a batch
// ---------------------------------------------------------------------------

export interface AssembleInput {
  id: string;
  /** d15 — names the artifact behind every line in it. */
  source: string;
  writtenAt: string;
  postings: Posting[];
  /** d10's destination. Resolved by the caller, by role. */
  suspenseAccountId: string;
}

/**
 * Postings in, a balanced batch out. **This never fails and never refuses.**
 *
 * d14's grouping is `(business date, account)` — and the currency joins the key
 * rather than being netted into it, because d17 forbids conversion and two
 * currencies on one account are two facts, not one sum.
 *
 * **Balancing is per business DATE, not per batch, and that is more than d10
 * asks for.** d10 speaks of *the journal*, which reads as the batch; but step
 * 15 has the export gather lines *by the dates their lines carry*, so a range
 * covering Monday and not Tuesday slices a two-day batch in half. If the
 * Suspense line sat on one of those days, the other day would export
 * unbalanced — a file the accountant's software rejects, which is the exact
 * failure d10's Suspense exists to make impossible. Balancing per date is
 * strictly stronger: a batch whose every date balances balances overall.
 *
 * **d25** settles it that way. The two rules are identical in an ordinary close
 * — one day means one difference and one Suspense line either way — and diverge
 * only where a close swept more than one day AND the arithmetic also failed.
 */
export function assembleJournal(input: AssembleInput): JournalBatch {
  const groups = new Map<string, { accountId: string; businessDate: string; currency: string; memos: string[]; cents: number }>();

  for (const p of input.postings) {
    if (!p.accountId) continue; // an unresolved seam is caught by the caller, loudly
    const key = `${p.businessDate}|${p.accountId}|${p.currency}`;
    const g = groups.get(key) ?? {
      accountId: p.accountId,
      businessDate: p.businessDate,
      currency: p.currency,
      memos: [],
      cents: 0,
    };
    g.cents += cents(p.amount);
    if (!g.memos.includes(p.memo)) g.memos.push(p.memo);
    groups.set(key, g);
  }

  // A group that nets to zero is not a line. A Section that sold a copy and
  // took it back the same day moved no money, and a $0.00 row in the file is
  // noise an accountant has to read before discarding.
  const lines: JournalLine[] = [...groups.values()]
    .filter((g) => g.cents !== 0)
    .map((g) => ({
      accountId: g.accountId,
      businessDate: g.businessDate,
      debit: g.cents > 0 ? dollars(g.cents) : 0,
      credit: g.cents < 0 ? dollars(-g.cents) : 0,
      currency: g.currency,
      memo: mergeMemos(g.memos),
    }));

  // d10 — the difference, per business date, goes to Suspense. Per date and
  // not per currency: an imbalance ACROSS currencies is not a currency
  // difference, it is our arithmetic failing, and d17 has nothing to convert
  // with. The Suspense line takes the currency the imbalance is in where there
  // is only one, which is every case this system can currently produce.
  //
  // **The total is GROSS, not net** (d25's accepted consequence, and it is the
  // first thing per-date balancing changes). A batch short $3 on Monday and
  // over $3 on Tuesday writes two Suspense lines, and netting them reports
  // zero — so `suspense` would be absent, `isImbalanced` false, and the Manager
  // told nothing, with two defect lines sitting in the file. Two errors are not
  // an absence of error, and summing the magnitudes is what says so.
  let suspenseTotal = 0;
  for (const date of [...new Set(lines.map((l) => l.businessDate))].sort()) {
    const onDate = lines.filter((l) => l.businessDate === date);
    const diff = onDate.reduce((sum, l) => sum + cents(l.debit) - cents(l.credit), 0);
    if (diff === 0) continue;
    const currency = onDate[0].currency;
    suspenseTotal += Math.abs(diff);
    lines.push({
      accountId: input.suspenseAccountId,
      businessDate: date,
      // A debit-heavy day needs a credit to Suspense to close it, and vice versa.
      debit: diff < 0 ? dollars(-diff) : 0,
      credit: diff > 0 ? dollars(diff) : 0,
      currency,
      memo: "Imbalance — a defect in this system, not a data-entry error (d10)",
    });
  }

  lines.sort((a, b) => (a.businessDate === b.businessDate ? 0 : a.businessDate < b.businessDate ? -1 : 1));

  return {
    id: input.id,
    source: input.source,
    writtenAt: input.writtenAt,
    lines,
    ...(suspenseTotal !== 0 ? { suspense: dollars(suspenseTotal) } : {}),
  };
}

/**
 * Grouping merges postings that share a date and an account, so it can also
 * merge their memos. Kept short rather than complete: the memos below are
 * written per account so that one distinct memo is the ordinary case, and a
 * line that somehow collects six is better read as "and 4 more" than as a
 * paragraph in a CSV cell.
 */
function mergeMemos(memos: string[]): string {
  if (memos.length <= 2) return memos.join(" · ");
  return `${memos.slice(0, 2).join(" · ")} · and ${memos.length - 2} more`;
}

// ---------------------------------------------------------------------------
// Reading a batch back
// ---------------------------------------------------------------------------

/** Whether a batch needed Suspense to close. Always a defect (d10). */
export const isImbalanced = (b: JournalBatch): boolean => (b.suspense ?? 0) !== 0;

/** For the checks below and for anything that wants to assert d10's invariant. */
export function batchTotals(b: JournalBatch): { debit: number; credit: number } {
  const d = b.lines.reduce((sum, l) => sum + cents(l.debit), 0);
  const c = b.lines.reduce((sum, l) => sum + cents(l.credit), 0);
  return { debit: dollars(d), credit: dollars(c) };
}

/**
 * **A business date has to be a date.**
 *
 * d14 has a line carry its own business date and d19 makes that date a calendar
 * day; the export then gathers a range *by the dates its lines carry* (step 15).
 * All three fail silently on a string that only looks like one — `10/09/2026`
 * sorts before `2026-01-01`, so a range query drops the line rather than
 * misplacing it, and nothing anywhere is unbalanced by it. **Suspense cannot
 * catch this**, because it is not an arithmetic failure: the journal is
 * perfectly balanced and filed in no period at all.
 *
 * So it is checked where a date enters the ledger, by whoever typed it in.
 */
export const isBusinessDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The business dates a batch touches, in order. A batch is not one date (d14). */
export const datesIn = (b: JournalBatch): string[] =>
  [...new Set(b.lines.map((l) => l.businessDate))].sort();
