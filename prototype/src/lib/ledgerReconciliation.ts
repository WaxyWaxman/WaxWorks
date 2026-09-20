import type { JournalBatch, JournalLine } from "../data/types";

/**
 * M-08 d25's other half — reconciling an account against an outside document.
 *
 * A reconciled set is entries **within one account**, marked together against
 * an outside document ([lexicon](../../../docs/lexicon.md) §11, d25) — and d37
 * gives it **two kinds**, because d25's single *nets to zero* rule served one of
 * the two cases d25 itself named. See `ReconciliationKind` below.
 *
 * **Two rules do all the work, and the second now depends on the kind:**
 *
 *   - **One account**, always. A set cannot span accounts. Reconciling is
 *     checking one column of this system's record against one outside document.
 *   - **Nets to zero** for a `matched` set, so the mark moves nothing by
 *     construction. A `cleared` set does not net, and must not be asked to.
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
 * d37 — **two kinds under one word**, and only one of them nets to zero.
 *
 *   `matched` — offsetting entries within one account, **balance-neutral by
 *     construction**. The two halves of an undeposited-funds movement. This is
 *     d25 unchanged, and the only kind that can claim the guarantee.
 *   `cleared` — the entries that **appear on an outside document**. A bank
 *     statement. The remainder is outstanding cheques and deposits in transit,
 *     and it is **the point of the exercise rather than a failure** — so
 *     nothing nets, and nothing is required to.
 *
 * d25 gave one rule and named two cases under it; building it showed the rule
 * serves one. A complete and correct September reconciliation of a bank account
 * was refused, *out by 18,800*, which is what turned the question from arguable
 * into visible.
 *
 * **Both move no money and gate nothing** — everything d25 established survives.
 * What changed is that *nets to zero* stops being the definition of reconciling
 * and becomes the definition of one kind of it. *And the cost is real:* a
 * cleared set is balance-neutral **by convention**, so the guarantee sum-to-zero
 * bought does not extend to it, and nothing but the Manager's attention stands
 * behind a cleared mark.
 */
export type ReconciliationKind = "matched" | "cleared";

/**
 * A-74 — `reconciliation_create` is **manager-only**, so both names are on it.
 * A-77 models it as `ledger_reconciliations` with
 * `ledger_reconciliation_members` beside it.
 */
export interface LedgerReconciliation {
  /** d37 — which shape this is. A reader cannot tell from the members. */
  kind: ReconciliationKind;
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
  /** d43 — the statement's own figures, on a cleared set. What it balanced to. */
  statement?: StatementBalances;
  reconciledAt: string;
  actorInitials: string;
  authorizedByInitials: string;
}

// ---------------------------------------------------------------------------
// Marking, and what the screen shows while it happens
// ---------------------------------------------------------------------------

export interface MarkedTotal {
  /**
   * Step 27 — *"marking entries until the difference is zero"* — for a
   * **matched** set. For a **cleared** one this is the amount the marked
   * entries came to, and it is **not** meant to reach zero (d37).
   */
  difference: number;
  count: number;
  balanced: boolean;
}

/**
 * d43 — the two figures a Manager copies off the bank statement.
 *
 * Supplying them is what makes a reconciliation a **bank** reconciliation:
 * *"If you do not supply a date, then the opening and closing balance fields
 * are not available. This indicates that you are reconciling entries within an
 * account but not balancing to an external document."*
 */
export interface StatementBalances {
  opening: number;
  closing: number;
}

/**
 * d43 — what a **cleared** set drives to zero: the statement's own movement,
 * less what has been marked.
 *
 * *"Your goal is to Mark entries so that a zero Balance results… If you
 * supplied opening and closing amounts then the Balance should be the
 * difference between the two. As you mark entries the balance will change."*
 */
export function clearedDifference(
  marked: ReconcilableEntry[],
  statement: StatementBalances,
): MarkedTotal {
  const moved = cents(statement.closing) - cents(statement.opening);
  const diff = moved - cents(markedTotal(marked).difference);
  return { difference: dollars(diff), count: marked.length, balanced: diff === 0 };
}

/**
 * d43 — what is left once the statement is accounted for.
 *
 * *"The remaining unmarked entries are considered to be outstanding… Under no
 * circumstances is there any reason for entries to remain unmarked unless they
 * are truly just waiting for bank clearance."* **This is the output of a bank
 * reconciliation**, and it is only worth anything because the marked set
 * balanced.
 */
export const outstandingAfter = (
  all: ReconcilableEntry[],
  marked: ReconcilableEntry[],
): ReconcilableEntry[] => {
  const taken = new Set(marked.map(entryKey));
  return all.filter((e) => !taken.has(entryKey(e)));
};

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
  kind: ReconciliationKind = "matched",
  statement?: StatementBalances,
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

  // d25, d37, d43 — **both kinds reach zero**, against different quantities.
  //
  // A MATCHED set nets to nothing among its own members: offsetting entries,
  // balance-neutral by construction.
  //
  // A CLEARED set nets against the STATEMENT'S OWN MOVEMENT — closing balance
  // less opening balance. d37 had it netting to nothing at all and accepted
  // that the mark was neutral only "by convention"; d43 restores the guarantee
  // by modelling the two figures a Manager copies off the paper.
  if (kind === "matched") {
    const { difference } = markedTotal(selected);
    if (cents(difference) !== 0) {
      return `This set is out by ${Math.abs(difference).toFixed(2)}. A matched set nets to zero — mark it as cleared against a statement instead (d37).`;
    }
    return undefined;
  }

  if (!statement) {
    return "A cleared set needs the statement's opening and closing balance (d43).";
  }
  const { difference } = clearedDifference(selected, statement);
  if (cents(difference) !== 0) {
    return (
      `Out by ${Math.abs(difference).toFixed(2)}. The statement moved ` +
      `${(statement.closing - statement.opening).toFixed(2)}; the marked entries come to ` +
      `${markedTotal(selected).difference.toFixed(2)}. Mark what is on the statement and leave the rest ` +
      `outstanding (d43).`
    );
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
  kind: ReconciliationKind = "matched",
  statement?: StatementBalances,
): LedgerReconciliation {
  return {
    id,
    kind,
    ...(statement ? { statement } : {}),
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
