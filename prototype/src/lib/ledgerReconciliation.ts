import type { JournalBatch, JournalLine } from "../data/types";

/**
 * M-08 d25's other half — reconciling an account against an outside document.
 *
 * *"A reconciled set is entries within one account, marked together, that net
 * to zero"* ([lexicon](../../../docs/lexicon.md) §11, d25). **Balance-neutral
 * by construction**, the same shape M-05 d15's clearing has and deliberately
 * not the same word — the lexicon widened *reconcile* rather than splitting it,
 * unlike *close*, which d4 had to replace because a day and a month are
 * genuinely different acts.
 *
 * **Two rules do all the work, and the second is the one that matters:**
 *
 *   - **One account.** A set cannot span accounts. Reconciling is checking one
 *     column of this system's record against one outside document.
 *   - **Nets to zero.** So the mark moves nothing, by construction rather than
 *     by a rule anyone has to enforce afterwards.
 *
 * *"Nothing downstream requires it"* (d25, step 27) — **an unreconciled account
 * seals exactly as a reconciled one does**, so the mark is evidence and never a
 * gate. Nothing in this module is imported by the seal, and that is deliberate.
 *
 * *Still open in the flow, and not closed here:* whether a seal should *say*
 * that an account has unreconciled entries. d25 makes it not a gate; whether it
 * is worth reporting is a different question, and the flow records the
 * reference model disagreeing in its guidance though not in its software.
 */

const cents = (n: number): number => Math.round(n * 100);
const dollars = (c: number): number => c / 100;

// ---------------------------------------------------------------------------
// Pointing at a line
// ---------------------------------------------------------------------------

/**
 * A `JournalLine` carries no id of its own — it is a row inside a batch (M-07
 * d7, A-67) — so a member is named by where it sits. `(batchId, lineIndex)` is
 * stable because a batch is **immutable once written**: nothing ever reorders
 * or removes a line, so an index cannot come to mean a different line later.
 *
 * The one artifact that is not immutable is the **draft** opening position
 * (A-78), and nothing may read a draft as though it were a journal, so it is
 * never reconcilable in the first place.
 */
export interface EntryRef {
  batchId: string;
  lineIndex: number;
}

export interface ReconcilableEntry extends EntryRef {
  line: JournalLine;
}

export const entryKey = (r: EntryRef): string => `${r.batchId}#${r.lineIndex}`;

/** Every line in one account, with a stable reference to each. */
export function entriesInAccount(
  batches: JournalBatch[],
  accountId: string,
): ReconcilableEntry[] {
  const out: ReconcilableEntry[] = [];
  for (const b of batches) {
    b.lines.forEach((line, lineIndex) => {
      if (line.accountId === accountId) out.push({ batchId: b.id, lineIndex, line });
    });
  }
  return out.sort((a, b) => a.line.businessDate.localeCompare(b.line.businessDate));
}

/** Signed: positive is a debit. */
export const entryAmount = (e: ReconcilableEntry): number =>
  dollars(cents(e.line.debit) - cents(e.line.credit));

// ---------------------------------------------------------------------------
// The artifact
// ---------------------------------------------------------------------------

/**
 * A-74 — `reconciliation_create` is **manager-only**, so both names are on it.
 * A-77 models it as `ledger_reconciliations` with
 * `ledger_reconciliation_members` beside it.
 */
export interface LedgerReconciliation {
  id: string;
  /** d25 — one account. A set cannot span two. */
  accountId: string;
  members: EntryRef[];
  /**
   * Step 27 — *"against an outside document"*. Free text, because the document
   * is outside this system by definition: PRD §7 NG-4 and M-05 d5 both keep
   * this flow from fetching anything, so what is recorded is what the Manager
   * says they checked against.
   */
  document: string;
  reconciledAt: string;
  actorInitials: string;
  authorizedByInitials: string;
}

// ---------------------------------------------------------------------------
// Marking, and what the screen shows while it happens
// ---------------------------------------------------------------------------

export interface MarkedTotal {
  /** Step 27 — *"marking entries until the difference is zero"*. */
  difference: number;
  count: number;
  balanced: boolean;
}

/** What the screen shows continuously while entries are being ticked. */
export function markedTotal(entries: ReconcilableEntry[]): MarkedTotal {
  const diff = entries.reduce((s, e) => s + cents(entryAmount(e)), 0);
  return { difference: dollars(diff), count: entries.length, balanced: diff === 0 };
}

/** The entries not yet in any live reconciliation — what is left to check. */
export function unreconciled(
  batches: JournalBatch[],
  accountId: string,
  reconciliations: LedgerReconciliation[],
): ReconcilableEntry[] {
  const taken = new Set(
    reconciliations.flatMap((r) => r.members.map(entryKey)),
  );
  return entriesInAccount(batches, accountId).filter((e) => !taken.has(entryKey(e)));
}

// ---------------------------------------------------------------------------
// What refuses a reconciliation
// ---------------------------------------------------------------------------

/**
 * Why this set may not be stamped, or undefined if it may. The house shape
 * (M-05's `unclearRefusal`): the rule as a pure function, so it can be held to
 * a test rather than being reachable only by driving a screen.
 *
 * Two of the four refusals are **inferred** and say so — d25 gives the two
 * substantive rules and is silent on the rest.
 */
export function reconciliationRefusal(
  selected: ReconcilableEntry[],
  document: string,
  existing: LedgerReconciliation[],
): string | undefined {
  // INFERRED, by parallel with M-05 d15, which needs at least two members.
  // A single entry netting to zero would be a $0.00 line, and no journal in
  // this system writes one — `assembleJournal` drops a group that nets to zero.
  if (selected.length < 2) return "A reconciled set needs at least two entries.";

  // d25 — one account. Checked before the arithmetic, because a set spanning
  // two accounts can net to zero and still be meaningless.
  const accounts = new Set(selected.map((e) => e.line.accountId));
  if (accounts.size > 1) {
    return `A reconciled set is entries within one account. This one spans ${accounts.size}.`;
  }

  // INFERRED. d25 says a set is marked "against an outside document" and does
  // not say the document must be named. Requiring it is what makes the mark
  // evidence rather than an assertion — "someone checked" with no record of
  // what they checked against is the thing d25 wanted the mark to be more than.
  if (document.trim() === "") return "Name the document this was checked against.";

  // INFERRED. Nothing says an entry may not be in two reconciled sets, and
  // nothing in this flow un-reconciles one either (M-05 d47's un-clearing has
  // no counterpart here). Refused because a second set containing the same
  // entry would make "which set cleared this" unanswerable.
  const taken = new Set(existing.flatMap((r) => r.members.map(entryKey)));
  const already = selected.filter((e) => taken.has(entryKey(e)));
  if (already.length > 0) {
    return `${already.length} of these entries are already reconciled.`;
  }

  // d25 — nets to zero, which is what makes it balance-neutral BY
  // CONSTRUCTION rather than by a rule enforced afterwards.
  const { difference } = markedTotal(selected);
  if (cents(difference) !== 0) {
    return `This set is out by ${Math.abs(difference).toFixed(2)}. A reconciled set nets to zero.`;
  }

  return undefined;
}

/**
 * d25, step 27 — **it moves no money.**
 *
 * This returns an empty array and always will. It exists so the claim has
 * somewhere to be tested and so no future caller reaches for a journal here:
 * a reconciliation is a **mark**, and the moment it wrote a line it would stop
 * being balance-neutral by construction and start being balance-neutral by
 * arithmetic that could be wrong.
 */
export const reconciliationJournalLines = (): JournalLine[] => [];

/** The set as it is stamped. Members only; nothing about the lines is copied. */
export function reconcile(
  id: string,
  selected: ReconcilableEntry[],
  document: string,
  by: { reconciledAt: string; actorInitials: string; authorizedByInitials: string },
): LedgerReconciliation {
  return {
    id,
    accountId: selected[0].line.accountId,
    members: selected.map(({ batchId, lineIndex }) => ({ batchId, lineIndex })),
    document,
    ...by,
  };
}

// ---------------------------------------------------------------------------
// The report (A-77's fourth kind)
// ---------------------------------------------------------------------------

export interface ReconciliationReport {
  accountId: string;
  asAt: string;
  sets: { id: string; document: string; reconciledAt: string; count: number }[];
  /** What has never been marked. The point of the report. */
  unreconciled: ReconcilableEntry[];
  unreconciledTotal: number;
}

export function reconciliationReport(
  accountId: string,
  asAt: string,
  batches: JournalBatch[],
  reconciliations: LedgerReconciliation[],
): ReconciliationReport {
  const mine = reconciliations.filter((r) => r.accountId === accountId);
  const open = unreconciled(batches, accountId, mine).filter((e) => e.line.businessDate <= asAt);
  return {
    accountId,
    asAt,
    sets: mine.map((r) => ({
      id: r.id,
      document: r.document,
      reconciledAt: r.reconciledAt,
      count: r.members.length,
    })),
    unreconciled: open,
    unreconciledTotal: markedTotal(open).difference,
  };
}
