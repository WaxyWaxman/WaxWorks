import { describe, expect, it } from "vitest";
import type { JournalBatch, JournalLine, LedgerPeriodSeal } from "../data/types";
import { sealRefusal, sealReport } from "./ledgerPeriods";
import {
  entriesInAccount,
  entryKey,
  markedTotal,
  reconcile,
  reconciliationJournalLines,
  reconciliationRefusal,
  reconciliationReport,
  unreconciled,
  type LedgerReconciliation,
} from "./ledgerReconciliation";
import { issueReconciliationReport } from "./ledgerStatements";

const line = (
  accountId: string,
  businessDate: string,
  debit: number,
  credit: number,
): JournalLine => ({
  accountId,
  businessDate,
  location: "0",
  debit,
  credit,
  currency: "CAD",
  memo: "",
});

const batch = (id: string, lines: JournalLine[]): JournalBatch => ({
  id,
  source: `posting:${id}`,
  writtenAt: "2026-09-01 09:00:00",
  lines,
});

const BY = {
  reconciledAt: "2026-10-01 10:00:00",
  actorInitials: "WW",
  authorizedByInitials: "WW",
};

/**
 * Undeposited funds: the till puts money in, the bank deposit takes it out.
 * Two halves of one movement — d25's own example, twice, plus one half that
 * has not been banked yet.
 */
const BATCHES: JournalBatch[] = [
  batch("close-1", [line("1100", "2026-09-01", 500, 0), line("4000", "2026-09-01", 0, 500)]),
  batch("dep-1", [line("1100", "2026-09-02", 0, 500), line("1010", "2026-09-02", 500, 0)]),
  batch("close-2", [line("1100", "2026-09-03", 300, 0), line("4000", "2026-09-03", 0, 300)]),
  batch("dep-2", [line("1100", "2026-09-04", 0, 300), line("1010", "2026-09-04", 300, 0)]),
  // Banked on the 5th, still sitting in undeposited funds.
  batch("close-3", [line("1100", "2026-09-05", 250, 0), line("4000", "2026-09-05", 0, 250)]),
];

const undeposited = () => entriesInAccount(BATCHES, "1100");

describe("M-08 d25 — a reconciled set is entries in ONE account that net to zero", () => {
  it("finds every entry in the account, in date order, with a stable reference", () => {
    // A JournalLine carries no id — it is a row inside an immutable batch — so
    // a member is named by where it sits, and nothing ever reorders a batch.
    const entries = undeposited();
    expect(entries.map((e) => e.line.businessDate)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(entryKey(entries[0])).toBe("close-1#0");
  });

  it("shows the difference while entries are being ticked, and says when it is zero", () => {
    // Step 27 — "marking entries until the difference is zero".
    const entries = undeposited();
    expect(markedTotal([entries[0]])).toEqual({ difference: 500, count: 1, balanced: false });
    expect(markedTotal([entries[0], entries[1]])).toEqual({
      difference: 0,
      count: 2,
      balanced: true,
    });
  });

  it("stamps the two halves of an undeposited-funds movement", () => {
    const entries = undeposited();
    const set = [entries[0], entries[1]];
    expect(reconciliationRefusal(set, "Bank statement, September", [])).toBeUndefined();

    const r = reconcile("rec-1", set, "Bank statement, September", BY);
    expect(r.accountId).toBe("1100");
    expect(r.members).toEqual([
      { batchId: "close-1", lineIndex: 0 },
      { batchId: "dep-1", lineIndex: 0 },
    ]);
  });

  it("refuses a set that does not net to zero, and names the gap", () => {
    const entries = undeposited();
    const why = reconciliationRefusal([entries[0], entries[3]], "Bank statement", []);
    expect(why).toBe("This set is out by 200.00. A reconciled set nets to zero.");
  });

  it("refuses a set spanning two accounts, before it looks at the arithmetic", () => {
    // A set spanning two accounts can net to zero and still be meaningless —
    // which is why the account check comes first.
    const mixed = [
      entriesInAccount(BATCHES, "1100")[0],
      entriesInAccount(BATCHES, "4000")[0],
    ];
    expect(markedTotal(mixed).balanced).toBe(true);
    expect(reconciliationRefusal(mixed, "Bank statement", [])).toContain("within one account");
  });
});

describe("M-08 d25 — balance-neutral BY CONSTRUCTION, and it moves no money", () => {
  it("writes no journal line, ever", () => {
    // "It moves no money" (step 27). The moment it wrote a line it would stop
    // being balance-neutral by construction and start being balance-neutral by
    // arithmetic that could be wrong.
    expect(reconciliationJournalLines()).toEqual([]);
  });

  it("leaves the account's balance exactly where it was", () => {
    const before = markedTotal(undeposited()).difference;
    reconcile("rec-1", [undeposited()[0], undeposited()[1]], "Bank statement", BY);
    expect(markedTotal(entriesInAccount(BATCHES, "1100")).difference).toBe(before);
  });
});

describe("M-08 d25 — the mark is evidence and never a gate", () => {
  it("seals a period with an account left unreconciled", () => {
    // "Nothing downstream requires it — an unreconciled account seals exactly
    // as a reconciled one does." Asserted by calling the seal with no
    // reconciliation anywhere in sight: it takes none, and cannot consult one.
    expect(sealRefusal("2026-09", [], [])).toBeUndefined();
    expect(sealReport("2026-09", 12).blocking).toEqual([]);
  });

  it("seals identically whether or not a set has been stamped", () => {
    const seals: LedgerPeriodSeal[] = [];
    const withoutMark = sealRefusal("2026-09", seals, []);
    reconcile("rec-1", [undeposited()[0], undeposited()[1]], "Bank statement", BY);
    expect(sealRefusal("2026-09", seals, [])).toBe(withoutMark);
  });
});

describe("M-08 — what is left to check", () => {
  const RECONCILED: LedgerReconciliation[] = [
    reconcile("rec-1", [undeposited()[0], undeposited()[1]], "Bank statement, Sept 1–2", BY),
  ];

  it("drops the marked entries and keeps the rest", () => {
    const open = unreconciled(BATCHES, "1100", RECONCILED);
    expect(open.map((e) => e.line.businessDate)).toEqual([
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("refuses to reconcile an entry that is already in a set", () => {
    // INFERRED — nothing says an entry may not be in two sets, and nothing
    // un-reconciles one either. Refused because a second set containing the
    // same entry makes "which set cleared this" unanswerable.
    const again = [undeposited()[0], undeposited()[1]];
    expect(reconciliationRefusal(again, "Bank statement", RECONCILED)).toBe(
      "2 of these entries are already reconciled.",
    );
  });

  it("refuses a set of one — INFERRED, by parallel with M-05 d15", () => {
    expect(reconciliationRefusal([undeposited()[0]], "Bank statement", [])).toBe(
      "A reconciled set needs at least two entries.",
    );
  });

  it("refuses an unnamed document — INFERRED", () => {
    // "Someone checked" with no record of what they checked against is the
    // thing d25 wanted the mark to be more than.
    const set = [undeposited()[0], undeposited()[1]];
    expect(reconciliationRefusal(set, "   ", [])).toBe(
      "Name the document this was checked against.",
    );
  });
});

describe("M-08 d25 — the rule serves one of the two cases d25 names", () => {
  it("does NOT reconcile a bank account against a bank statement", () => {
    // OPEN QUESTION, demonstrated rather than asserted in prose.
    //
    // d25 and lexicon §11 both give one rule — "entries within one account,
    // marked together, that net to zero" — and both name TWO cases: "a bank
    // statement, or the two halves of an undeposited-funds movement."
    //
    // The second works exactly (every test above). The first does not. A bank
    // reconciliation ticks the entries that APPEAR ON THE STATEMENT; what is
    // left over is outstanding cheques and deposits in transit. The ticked set
    // has no reason to net to zero — a month that took in more than it paid
    // out nets to whatever the balance moved by, which is the whole point.
    const bank = entriesInAccount(BATCHES, "1010");
    expect(bank.map((e) => e.line.businessDate)).toEqual(["2026-09-02", "2026-09-04"]);

    // Both deposits cleared the bank. That is a complete, correct September
    // reconciliation of this account — and the rule refuses it.
    expect(markedTotal(bank).difference).toBe(800);
    expect(reconciliationRefusal(bank, "Bank statement, September", [])).toBe(
      "This set is out by 800.00. A reconciled set nets to zero.",
    );

    // The only sets this account CAN produce are offsetting pairs, which for a
    // bank account means a payment that happens to equal a deposit — a
    // coincidence, not a reconciliation.
  });
});

describe("M-08, A-77 — the reconciliation report is the fourth issuance kind", () => {
  const RECONCILED: LedgerReconciliation[] = [
    reconcile("rec-1", [undeposited()[0], undeposited()[1]], "Bank statement, Sept 1–2", BY),
  ];

  it("lists the stamped sets and everything still open", () => {
    const report = reconciliationReport("1100", "2026-09-30", BATCHES, RECONCILED);
    expect(report.sets).toEqual([
      { id: "rec-1", document: "Bank statement, Sept 1–2", reconciledAt: BY.reconciledAt, count: 2 },
    ]);
    expect(report.unreconciled).toHaveLength(3);
    expect(report.unreconciledTotal).toBe(250);
  });

  it("respects the as-at date, like every other statement (d30)", () => {
    const report = reconciliationReport("1100", "2026-09-03", BATCHES, RECONCILED);
    expect(report.unreconciled.map((e) => e.line.businessDate)).toEqual(["2026-09-03"]);
  });

  it("issues as an as-at INSTANT, because it asserts a moment (A-77)", () => {
    const report = reconciliationReport("1100", "2026-09-30", BATCHES, RECONCILED);
    const issued = issueReconciliationReport("iss-r1", report, true, {
      issuedAt: "2026-10-01 11:00:00",
      actorInitials: "WW",
      authorizedByInitials: "WW",
    });
    expect(issued.kind).toBe("reconciliation-report");
    expect(issued.scope).toEqual({ kind: "as-at", at: "2026-09-30" });
    expect(issued.provisional).toBe(true);
    expect(issued.figures.unreconciledTotal).toBe(250);
  });
});
