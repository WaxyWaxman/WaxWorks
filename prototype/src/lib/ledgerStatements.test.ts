import { describe, expect, it } from "vitest";
import type {
  GLAccount,
  GLAccountType,
  GLRole,
  JournalBatch,
  JournalLine,
  LedgerPeriodSeal,
} from "../data/types";
import {
  balanceSheet,
  exportLines,
  exportOverlaps,
  isProvisional,
  issuancesTouching,
  issueBalanceSheet,
  issueExport,
  issueProfitAndLoss,
  profitAndLoss,
  reopenIssuance,
  type LedgerIssuance,
} from "./ledgerStatements";

const acct = (
  id: string,
  name: string,
  role?: GLRole,
  type?: GLAccountType,
): GLAccount => ({ id, name, number: id, active: true, ...(role ? { role } : {}), ...(type ? { type } : {}) });

const ACCOUNTS: GLAccount[] = [
  acct("1010", "Chequing", "bank"),
  acct("1200", "Inventory", "inventory"),
  acct("2400", "Customer credit", "customer-credit"),
  acct("2500", "Bank loan", undefined, "liability"),
  acct("3000", "Owner's equity", "owners-equity"),
  acct("4000", "Sales", "revenue"),
  acct("5000", "Cost of goods sold", "cogs"),
  acct("6400", "Rent", undefined, "expense"),
];

const line = (
  accountId: string,
  businessDate: string,
  debit: number,
  credit: number,
  extra: Partial<JournalLine> = {},
): JournalLine => ({
  accountId,
  businessDate,
  location: "0",
  debit,
  credit,
  currency: "CAD",
  memo: "",
  ...extra,
});

const batch = (id: string, lines: JournalLine[]): JournalBatch => ({
  id,
  source: `posting:${id}`,
  writtenAt: "2026-09-01 09:00:00",
  lines,
});

const seal = (id: string, period: string): LedgerPeriodSeal => ({
  id,
  period,
  sealedAt: `${period}-28 17:00:00`,
  actorInitials: "WW",
  authorizedByInitials: "WW",
});

const DEC = 12;

/**
 * Opening: 20,000 bank and 15,000 inventory against 35,000 equity.
 * September: sold for 5,000 (cost 3,000), paid 1,200 rent.
 */
const BATCHES: JournalBatch[] = [
  batch("open", [
    line("1010", "2026-08-31", 20_000, 0),
    line("1200", "2026-08-31", 15_000, 0),
    line("3000", "2026-08-31", 0, 35_000),
  ]),
  batch("sale", [
    line("1010", "2026-09-05", 5_000, 0),
    line("4000", "2026-09-05", 0, 5_000, { section: "ROCK" }),
    line("5000", "2026-09-05", 3_000, 0),
    line("1200", "2026-09-05", 0, 3_000),
  ]),
  batch("rent", [line("6400", "2026-09-10", 1_200, 0), line("1010", "2026-09-10", 0, 1_200)]),
];

describe("M-08 d23 — the books state a profit, and the bottom line is called one", () => {
  it("states revenue, cost of goods, expenses and a profit", () => {
    // M-07 d27 retired the prohibition; this flow is what earned it. Phase 2's
    // typed postings bring in the rent whose absence made the figure wrong.
    const pl = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []);
    expect(pl.totalRevenue).toBe(5_000);
    expect(pl.totalCostOfGoods).toBe(3_000);
    expect(pl.totalExpenses).toBe(1_200);
    expect(pl.profit).toBe(800);
  });

  it("reads revenue as a positive figure although it is a credit balance", () => {
    const pl = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []);
    expect(pl.revenue).toEqual([{ accountId: "4000", name: "Sales", amount: 5_000 }]);
  });

  it("states the period it covers, because d9 makes the first year a short one", () => {
    // "A short first year must not read as a bad one."
    const pl = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []);
    expect(pl.from).toBe("2026-09-01");
    expect(pl.to).toBe("2026-09-30");
  });

  it("carries no balance-sheet account into the P&L", () => {
    const pl = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []);
    const ids = [...pl.revenue, ...pl.costOfGoods, ...pl.expenses].map((l) => l.accountId);
    expect(ids).not.toContain("1010");
    expect(ids).not.toContain("3000");
  });

  it("narrows by section without changing what the bottom line means", () => {
    const rock = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], [], {
      section: "ROCK",
    });
    expect(rock.totalRevenue).toBe(5_000);
    expect(rock.totalCostOfGoods).toBe(0);
  });
});

describe("M-08 d30 — a statement excludes what is dated after it, and says so", () => {
  const WITH_FUTURE: JournalBatch[] = [
    ...BATCHES,
    batch("cheque", [line("6400", "2026-10-15", 900, 0), line("1010", "2026-10-15", 0, 900)]),
  ];

  it("leaves a future-dated line out of the P&L", () => {
    // A-73 permits a cheque written today against next month, and d30 settles
    // what a statement does with it: "any other answer makes the date on the
    // document a suggestion."
    const pl = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, WITH_FUTURE, [], []);
    expect(pl.totalExpenses).toBe(1_200);
    expect(pl.profit).toBe(800);
  });

  it("leaves it out of the balance sheet too — every statement answers the same way", () => {
    // "Two reports of one moment must not disagree, and they only cannot if the
    // rule is one rule." Asserted as the identity rather than as a number:
    // adding a future-dated posting must not move an as-at-30-September figure
    // at all, and comparing the two runs says that where a literal would only
    // restate whichever total I happened to compute.
    const without = balanceSheet("2026-09-30", ACCOUNTS, BATCHES, [], [], DEC);
    const withFuture = balanceSheet("2026-09-30", ACCOUNTS, WITH_FUTURE, [], [], DEC);

    expect(withFuture.totalAssets).toBe(without.totalAssets);
    expect(withFuture.totalEquity).toBe(without.totalEquity);
    expect(withFuture.currentEarnings).toBe(without.currentEarnings);
    expect(withFuture.outOfBalance).toBe(0);
    // 23,800 bank + 12,000 inventory — the cheque is not in either.
    expect(withFuture.totalAssets).toBe(35_800);
  });

  it("SAYS the later lines exist without including them", () => {
    // d30's accepted consequence: "the ledger can hold money no statement
    // shows... so a statement has to be able to say that lines after its date
    // exist, without including them."
    const pl = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, WITH_FUTURE, [], []);
    expect(pl.later.count).toBe(2);
    expect(pl.later.firstDate).toBe("2026-10-15");

    const bs = balanceSheet("2026-09-30", ACCOUNTS, WITH_FUTURE, [], [], DEC);
    expect(bs.later.count).toBe(2);
  });

  it("shows them once their date has arrived", () => {
    const pl = profitAndLoss("2026-10-01", "2026-10-31", ACCOUNTS, WITH_FUTURE, [], []);
    expect(pl.totalExpenses).toBe(900);
    expect(pl.later.count).toBe(0);
    expect(pl.later.firstDate).toBeUndefined();
  });
});

describe("M-08 d24 — current earnings is derived when the statement is drawn", () => {
  it("balances only because equity carries the result so far", () => {
    // "Assets less liabilities exceeds opening equity by exactly the profit to
    // date."
    const bs = balanceSheet("2026-09-30", ACCOUNTS, BATCHES, [], [], DEC);
    expect(bs.totalAssets).toBe(35_800); // 23,800 bank + 12,000 inventory
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.currentEarnings).toBe(800);
    expect(bs.totalEquity).toBe(35_800); // 35,000 posted + 800 derived
    expect(bs.outOfBalance).toBe(0);
  });

  it("names the derived line rather than folding it into a total", () => {
    // d24's accepted consequence: retained earnings on the chart is only
    // correct immediately after a year-end seal, so between seals equity as
    // POSTED and equity as SHOWN differ by the year to date — which reads as a
    // discrepancy to anyone comparing the chart against the statement.
    const bs = balanceSheet("2026-09-30", ACCOUNTS, BATCHES, [], [], DEC);
    const posted = bs.equity.reduce((s, l) => s + l.amount, 0);
    expect(posted).toBe(35_000);
    expect(bs.currentEarnings).toBe(800);
    expect(bs.totalEquity).toBe(posted + bs.currentEarnings);
  });

  it("posts nothing — no equity line appears in the journal", () => {
    // M-07 d12 stays intact: a journal is written by the artifact that causes
    // it, and no artifact causes a month's profit. The only equity postings
    // this system ever writes are the year-end seal's (d17).
    const equityLines = BATCHES.flatMap((b) => b.lines).filter((l) => l.accountId === "3000");
    expect(equityLines).toHaveLength(1);
    expect(equityLines[0].businessDate).toBe("2026-08-31"); // the opening position
  });

  it("derives from the fiscal year to date, not from all of history", () => {
    const priorYear = [
      batch("last", [line("6400", "2025-11-01", 400, 0), line("1010", "2025-11-01", 0, 400)]),
      ...BATCHES,
    ];
    const bs = balanceSheet("2026-09-30", ACCOUNTS, priorYear, [], [], DEC);
    expect(bs.currentEarnings).toBe(800);
  });
});

describe("M-08, E-07 d21 — customer balances classify by sign and never net", () => {
  const CUSTOMERS: JournalBatch[] = [
    ...BATCHES,
    // The net of +200 and -300 is -100: a debit balance on a liability account.
    batch("cust", [line("2400", "2026-09-20", 100, 0), line("1010", "2026-09-20", 0, 100)]),
  ];

  it("states 200 of liability and 300 of asset, never a net of -100", () => {
    // E-07 d21's own example. "A customer at +$200 and another at −$300 sum to
    // −$100, which belongs on no statement."
    const bs = balanceSheet("2026-09-30", ACCOUNTS, CUSTOMERS, [], [], DEC, [200, -300]);
    const credit = bs.liabilities.find((l) => l.name.includes("store credit"));
    const owed = bs.assets.find((l) => l.name.includes("owed by customers"));
    expect(credit?.amount).toBe(200);
    expect(owed?.amount).toBe(300);
  });

  it("still balances — the split is a presentation, not a movement", () => {
    const bs = balanceSheet("2026-09-30", ACCOUNTS, CUSTOMERS, [], [], DEC, [200, -300]);
    expect(bs.outOfBalance).toBe(0);
  });

  it("states the ledger's NET where no customer balances are supplied", () => {
    // The chart holds one account carrying the net of every Customer, so a
    // balance sheet drawn from the journal alone cannot satisfy d21 — which is
    // why the balances are an input rather than something derived here.
    const bs = balanceSheet("2026-09-30", ACCOUNTS, CUSTOMERS, [], [], DEC);
    expect(bs.assets.some((l) => l.accountId === "2400")).toBe(true);
    expect(bs.liabilities.some((l) => l.accountId === "2400")).toBe(false);
  });
});

describe("M-08 d25, M-08 d31, A-77 — an issuance stores the figures and never recomputes", () => {
  const pl = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []);
  const issued = issueProfitAndLoss(
    "iss-1",
    { kind: "range", from: "2026-09-01", toExclusive: "2026-10-01" },
    pl,
    { issuedAt: "2026-10-02 09:00:00", actorInitials: "WW", authorizedByInitials: "WW" },
  );

  it("re-opens to what was issued, not to a fresh figure", () => {
    // d31: "otherwise the record of what the accountant holds could quietly
    // change, which is the whole reason it is stored."
    const later = [...BATCHES, batch("late", [line("6400", "2026-09-28", 500, 0)])];
    const recomputed = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, later, [], []);

    expect(recomputed.profit).toBe(300);
    expect(reopenIssuance(issued).profit).toBe(800);
  });

  it("stores figures rather than a rendered file, so one issuance serves every format", () => {
    const figures = reopenIssuance(issued);
    expect(figures.revenue).toEqual([{ accountId: "4000", name: "Sales", amount: 5_000 }]);
    expect(typeof figures.profit).toBe("number");
  });

  it("carries an as-at INSTANT for a balance sheet, not a degenerate range", () => {
    // A-77: "Encode an instant as a degenerate range and every balance sheet
    // overlaps every earlier export, so d16's overlap warning — its entire
    // purpose — becomes noise."
    const bs = issueBalanceSheet(
      "iss-2",
      balanceSheet("2026-09-30", ACCOUNTS, BATCHES, [], [], DEC),
      { issuedAt: "2026-10-02 09:00:00", actorInitials: "WW", authorizedByInitials: "WW" },
    );
    expect(bs.scope.kind).toBe("as-at");
    expect(bs.scope.at).toBe("2026-09-30");
  });
});

describe("M-07 d16, A-77 — the overlap warning, and whose rule it is", () => {
  const BY = { issuedAt: "2026-10-02 09:00:00", actorInitials: "WW", authorizedByInitials: "WW" };
  const exports_: LedgerIssuance[] = [
    issueExport(
      "e1",
      "2026-09-01",
      "2026-10-01",
      exportLines(BATCHES, "2026-09-01", "2026-10-01"),
      [],
      [],
      BY,
    ),
  ];

  it("warns when a second export covers the same days", () => {
    // d16's purpose: "importing the same journal twice silently doubles the
    // books."
    const clash = exportOverlaps({ from: "2026-09-15", toExclusive: "2026-10-15" }, exports_);
    expect(clash.map((i) => i.id)).toEqual(["e1"]);
  });

  it("does NOT warn on an adjacent range — the bounds are half-open", () => {
    expect(exportOverlaps({ from: "2026-10-01", toExclusive: "2026-11-01" }, exports_)).toEqual([]);
    expect(exportOverlaps({ from: "2026-08-01", toExclusive: "2026-09-01" }, exports_)).toEqual([]);
  });

  it("does NOT warn on a P&L over the same months", () => {
    // A-77: "an export moves the journal itself and duplicating it corrupts the
    // destination, while a statement asserts a moment and duplicating it
    // corrupts nothing."
    const withStatement: LedgerIssuance[] = [
      ...exports_,
      issueProfitAndLoss(
        "p1",
        { kind: "range", from: "2026-08-01", toExclusive: "2026-09-01" },
        profitAndLoss("2026-08-01", "2026-08-31", ACCOUNTS, BATCHES, [], []),
        { issuedAt: "2026-09-02 09:00:00", actorInitials: "WW", authorizedByInitials: "WW" },
      ),
    ];
    const clash = exportOverlaps({ from: "2026-08-01", toExclusive: "2026-09-01" }, withStatement);
    expect(clash).toEqual([]);
  });

  it("exports only the lines inside the half-open range", () => {
    const lines = exportLines(BATCHES, "2026-09-01", "2026-10-01");
    expect(lines.every((l) => l.businessDate >= "2026-09-01" && l.businessDate < "2026-10-01")).toBe(
      true,
    );
    expect(lines.some((l) => l.businessDate === "2026-08-31")).toBe(false);
  });
});

describe("M-08 d29, A-77 — the unseal applies a different rule to the same log", () => {
  const BY = { issuedAt: "2026-10-02 09:00:00", actorInitials: "WW", authorizedByInitials: "WW" };
  const issuances: LedgerIssuance[] = [
    issueExport("e1", "2026-09-01", "2026-10-01", [], [], [], BY),
    issueBalanceSheet(
      "b1",
      balanceSheet("2026-09-30", ACCOUNTS, BATCHES, [seal("s1", "2026-09")], [], DEC),
      BY,
    ),
  ];

  it("warns on ANY issuance touching the period, whatever its kind", () => {
    // The unseal's question is different from the export screen's: an unseal
    // changes figures "the accountant may already hold" (d18, d29), so a
    // balance sheet counts every bit as much as an export.
    expect(issuancesTouching("2026-09", issuances).map((i) => i.id).sort()).toEqual(["b1", "e1"]);
  });

  it("leaves a period nothing has been issued for alone", () => {
    expect(issuancesTouching("2026-11", issuances)).toEqual([]);
  });

  it("does not catch a period an adjacent half-open export stops short of", () => {
    expect(issuancesTouching("2026-10", issuances)).toEqual([]);
  });
});

describe("M-08 d36 — provisional, stored on the issuance and never recomputed", () => {
  const BY = { issuedAt: "2026-10-02 09:00:00", actorInitials: "WW", authorizedByInitials: "WW" };
  const SEPT = { kind: "range", from: "2026-09-01", toExclusive: "2026-10-01" } as const;

  it("marks a statement over an unsealed period", () => {
    const open = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []);
    expect(open.periodSealed).toBe(false);
    expect(isProvisional(open)).toBe(true);
    expect(issueProfitAndLoss("i1", SEPT, open, BY).provisional).toBe(true);
  });

  it("says NOTHING on the sealed side — *final* is a promise d29 can break", () => {
    // An unseal is always available on the most recently sealed period, and
    // the whole unseal apparatus exists because that happens. The absence of
    // the word is the absence of a warning, not a claim (d15's shape).
    const seals = [seal("s1", "2026-09")];
    const sealed = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, seals, []);
    const issued = issueProfitAndLoss("i2", SEPT, sealed, BY);
    expect(issued.provisional).toBe(false);
    expect(JSON.stringify(issued).toLowerCase()).not.toContain("final");
  });

  it("KEEPS the mark when the period seals afterwards — the point of storing it", () => {
    // d31: "re-opening a stored issuance shows what was issued, never a
    // recomputation." A rendered label would silently vanish here, and the
    // record of what the accountant holds would have quietly changed.
    const open = profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []);
    const issued = issueProfitAndLoss("i3", SEPT, open, BY);

    // September is sealed later. The stored issuance does not move.
    const seals = [seal("s1", "2026-09")];
    expect(profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, seals, []).periodSealed).toBe(
      true,
    );
    expect(issued.provisional).toBe(true);
    expect(reopenIssuance(issued).periodSealed).toBe(false);
  });

  it("distinguishes the two copies an unseal has to warn about", () => {
    // A-77's gain: "they hold a copy that said provisional" and "they hold a
    // copy that said nothing" are different situations, and the second is worse.
    const seals = [seal("s1", "2026-09")];
    const provisional = issueProfitAndLoss(
      "i4",
      SEPT,
      profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, [], []),
      BY,
    );
    const firm = issueProfitAndLoss(
      "i5",
      SEPT,
      profitAndLoss("2026-09-01", "2026-09-30", ACCOUNTS, BATCHES, seals, []),
      BY,
    );
    const touching = issuancesTouching("2026-09", [provisional, firm]);
    expect(touching.filter((i) => !i.provisional).map((i) => i.id)).toEqual(["i5"]);
  });

  it("marks a balance sheet the same way, from its own as-at date", () => {
    const open = balanceSheet("2026-09-30", ACCOUNTS, BATCHES, [], [], DEC);
    const issued = issueBalanceSheet("i6", open, BY);
    expect(issued.provisional).toBe(true);
    expect(issued.scope.at).toBe(open.asAt);
  });

  it("marks an export whose range touches an unsealed period", () => {
    const seals = [seal("s1", "2026-09")];
    const lines = exportLines(BATCHES, "2026-09-01", "2026-10-01");
    expect(issueExport("e2", "2026-09-01", "2026-10-01", lines, seals, [], BY).provisional).toBe(false);
    expect(issueExport("e3", "2026-09-01", "2026-11-01", lines, seals, [], BY).provisional).toBe(true);
  });

  it("needs EVERY period in the range sealed, not just the first", () => {
    const seals = [seal("s1", "2026-09")];
    const spanning = profitAndLoss("2026-09-01", "2026-10-31", ACCOUNTS, BATCHES, seals, []);
    expect(spanning.periodSealed).toBe(false);
    expect(isProvisional(spanning)).toBe(true);
  });
});
