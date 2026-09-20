import { describe, expect, it } from "vitest";
import type { JournalBatch, JournalLine, LedgerPeriodSeal } from "../data/types";
import { sealRefusal, sealReport } from "./ledgerPeriods";
import {
  entriesInAccount,
  entryKey,
  markedTotal,
  outstandingAfter,
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

  it("refuses a MATCHED set that does not net to zero, and names the other kind", () => {
    // d37 — the refusal now points at the way forward rather than only saying
    // no, because since d37 there IS a way forward.
    const entries = undeposited();
    const why = reconciliationRefusal([entries[0], entries[3]], "Bank statement", []);
    expect(why).toContain("out by 200.00");
    expect(why).toContain("A matched set nets to zero");
    expect(why).toContain("cleared");
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

describe("M-08 d37, d43 — a bank statement is a second KIND, and it balances too", () => {
  // This describe block used to assert the opposite: that a complete and
  // correct bank reconciliation was REFUSED, out by 18,800. It was right, and
  // it is what turned the open question from arguable into visible. d37 answers
  // it, so the demonstration becomes the regression test for the answer.

  it("still refuses a bank account as a MATCHED set — nothing about d25 changed", () => {
    const bank = entriesInAccount(BATCHES, "1010");
    expect(markedTotal(bank).difference).toBe(800);
    expect(reconciliationRefusal(bank, "Bank statement, September", [], "matched")).toContain(
      "A matched set nets to zero",
    );
  });

  it("M-08 d43 — a CLEARED set balances against the statement's own two figures", () => {
    // d37 had this netting to nothing at all, and accepted that the mark was
    // neutral only "by convention". The reference balances it against the
    // statement: "the Balance should be the difference between the two. As you
    // mark entries the balance will change" — so d43 restores the guarantee.
    //
    // The bank account moved 800 in September. A statement showing the same
    // movement reconciles; one showing anything else does not.
    const bank = entriesInAccount(BATCHES, "1010");
    expect(markedTotal(bank).difference).toBe(800);

    expect(
      reconciliationRefusal(bank, "Bank statement, September", [], "cleared", {
        opening: 1_000,
        closing: 1_800,
      }),
    ).toBeUndefined();
  });

  it("M-08 d43 — refuses when the marked entries do not account for the movement", () => {
    const bank = entriesInAccount(BATCHES, "1010");
    const why = reconciliationRefusal(bank, "Bank statement", [], "cleared", {
      opening: 1_000,
      closing: 1_950,
    });
    expect(why).toContain("Out by 150.00");
    expect(why).toContain("statement moved 950.00");
    expect(why).toContain("leave the rest outstanding");
  });

  it("M-08 d43 — refuses a cleared set with no statement figures at all", () => {
    // Supplying them is what makes it a BANK reconciliation rather than a
    // pairing exercise. Without them there is nothing to balance against.
    const bank = entriesInAccount(BATCHES, "1010");
    expect(reconciliationRefusal(bank, "Bank statement", [], "cleared")).toContain(
      "needs the statement's opening and closing balance",
    );
  });

  it("M-08 d43 — the unmarked remainder is the OUTSTANDING list, and is the output", () => {
    // "The remaining unmarked entries are considered to be outstanding… Under
    // no circumstances is there any reason for entries to remain unmarked
    // unless they are truly just waiting for bank clearance."
    const bank = entriesInAccount(BATCHES, "1010");
    const marked = [bank[0]];
    const outstanding = outstandingAfter(bank, marked);
    expect(outstanding).toHaveLength(bank.length - 1);
    expect(outstanding.map((e) => e.line.businessDate)).not.toContain(bank[0].line.businessDate);
  });

  it("M-08 d43 — records the statement it balanced to, on the stamped set", () => {
    const bank = entriesInAccount(BATCHES, "1010");
    const r = reconcile("rec-b9", bank, "Bank statement, September", BY, "cleared", {
      opening: 1_000,
      closing: 1_800,
    });
    expect(r.kind).toBe("cleared");
    expect(r.statement).toEqual({ opening: 1_000, closing: 1_800 });
  });

  it("keeps every other rule for a cleared set — one account, a document, no double-marking", () => {
    // d37 changed one rule and no others. Balance-neutral is what it relaxed;
    // the rest of d25 stands for both kinds.
    const mixed = [entriesInAccount(BATCHES, "1100")[0], entriesInAccount(BATCHES, "4000")[0]];
    expect(reconciliationRefusal(mixed, "Statement", [], "cleared")).toContain("within one account");
    const bank = entriesInAccount(BATCHES, "1010");
    expect(reconciliationRefusal(bank, "  ", [], "cleared")).toContain("Name the document");
    expect(reconciliationRefusal([bank[0]], "Statement", [], "cleared")).toContain("at least two");
  });

  it("records WHICH kind it was, because the members do not say", () => {
    // d37's accepted consequence: a Manager has to know which they are doing
    // before they start, and ticking the same entries under the other kind
    // means something different.
    const bank = entriesInAccount(BATCHES, "1010");
    const cleared = reconcile("rec-b1", bank, "Bank statement, September", BY, "cleared");
    expect(cleared.kind).toBe("cleared");

    const pair = [undeposited()[0], undeposited()[1]];
    expect(reconcile("rec-u1", pair, "Deposit slip", BY).kind).toBe("matched");
  });

  it("leaves a cleared set balance-neutral by CONVENTION, not by construction", () => {
    // The cost d37 accepted, asserted so it is not forgotten: nothing but the
    // Manager's attention stands behind a cleared mark, where a matched set is
    // provably neutral.
    const bank = entriesInAccount(BATCHES, "1010");
    const cleared = reconcile("rec-b2", bank, "Bank statement", BY, "cleared");
    expect(markedTotal(bank).balanced).toBe(false);
    expect(cleared.kind).toBe("cleared");
    // And it still moves no money — that half is unchanged for both kinds.
    expect(reconciliationJournalLines()).toEqual([]);
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
