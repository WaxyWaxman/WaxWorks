import { describe, expect, it } from "vitest";
import type {
  JournalBatch,
  JournalLine,
  LedgerPeriodSeal,
  LedgerPeriodUnseal,
} from "../data/types";
import {
  accountEnquiry,
  activityBetween,
  closingTransactionFor,
  divergenceFlag,
  divergences,
  recomputeAsAt,
  totalOf,
} from "./ledgerBalances";

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

const unseal = (id: string, sealId: string): LedgerPeriodUnseal => ({
  id,
  sealId,
  unsealedAt: "2026-09-17 10:00:00",
  actorInitials: "WW",
  authorizedByInitials: "WW",
  reason: "Accountant's adjustment",
});

/** August: rent 1200 and utilities 400 out of the bank. September: rent again. */
const BATCHES: JournalBatch[] = [
  batch("b1", [line("6400", "2026-08-01", 1200, 0), line("1010", "2026-08-01", 0, 1200)]),
  batch("b2", [line("6410", "2026-08-15", 400, 0), line("1010", "2026-08-15", 0, 400)]),
  batch("b3", [line("6400", "2026-09-01", 1200, 0), line("1010", "2026-09-01", 0, 1200)]),
];

describe("M-08 A-76 — the recomputation is the only place a balance is computed", () => {
  it("sums to an as-at date, signed, with a debit positive", () => {
    const rows = recomputeAsAt(BATCHES, "2026-08-31");
    expect(totalOf(rows.filter((r) => r.accountId === "6400"))).toBe(1200);
    expect(totalOf(rows.filter((r) => r.accountId === "1010"))).toBe(-1600);
  });

  it("EXCLUDES a line dated after the as-at date — d30, and A-73 makes it real", () => {
    // A-73 permits a cheque written today against next month, so this is not a
    // theoretical case. "Any other answer makes the date on the document a
    // suggestion."
    const rows = recomputeAsAt(BATCHES, "2026-08-31");
    expect(totalOf(rows.filter((r) => r.accountId === "6400"))).toBe(1200);
    const later = recomputeAsAt(BATCHES, "2026-09-30");
    expect(totalOf(later.filter((r) => r.accountId === "6400"))).toBe(2400);
  });

  it("drops a group that nets to zero rather than emitting a $0.00 row", () => {
    const wash = [batch("w", [line("6400", "2026-08-01", 500, 0), line("6400", "2026-08-02", 0, 500)])];
    expect(recomputeAsAt(wash, "2026-08-31")).toEqual([]);
  });

  it("sums in cents, so a balance is never wrong by being binary", () => {
    const pennies = [
      batch("p", [
        line("6400", "2026-08-01", 0.1, 0),
        line("6400", "2026-08-02", 0.2, 0),
        line("1010", "2026-08-02", 0, 0.3),
      ]),
    ];
    expect(totalOf(recomputeAsAt(pennies, "2026-08-31"))).toBe(0);
  });
});

describe("M-08 d2 — a filter is the same query, at the account, section and location", () => {
  const SECTIONED: JournalBatch[] = [
    batch("s1", [
      line("4000", "2026-08-01", 0, 300, { section: "ROCK" }),
      line("4000", "2026-08-01", 0, 200, { section: "JAZZ" }),
      line("1010", "2026-08-01", 500, 0),
    ]),
  ];

  it("totals an account across every section", () => {
    expect(totalOf(recomputeAsAt(SECTIONED, "2026-08-31", { accountId: "4000" }))).toBe(-500);
  });

  it("totals the same account within one section — the same query, one filter", () => {
    // d2: "totalling an account across all Sections and totalling it within one
    // are the same query with a different filter."
    expect(
      totalOf(recomputeAsAt(SECTIONED, "2026-08-31", { accountId: "4000", section: "ROCK" })),
    ).toBe(-300);
  });

  it("keeps the three dimensions apart in the grain", () => {
    const rows = recomputeAsAt(SECTIONED, "2026-08-31", { accountId: "4000" });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.section).sort()).toEqual(["JAZZ", "ROCK"]);
    for (const r of rows) expect(r.location).toBe("0");
  });

  it("an absent filter means EVERY, never BLANK", () => {
    // A line with no section is *not applicable* (d12), and an unfiltered
    // enquiry must still include it.
    const mixed = [
      batch("m", [
        line("4000", "2026-08-01", 0, 300, { section: "ROCK" }),
        line("4000", "2026-08-02", 0, 100),
      ]),
    ];
    expect(totalOf(recomputeAsAt(mixed, "2026-08-31", { accountId: "4000" }))).toBe(-400);
  });
});

describe("M-08 d20, A-76 — the closing transaction IS the recomputation, materialised", () => {
  it("stores exactly what the recomputation returns for the period end", () => {
    // Not a convenience: a second summing routine here would reintroduce the
    // two paths A-76 removed. "Stored is by definition the last recomputed."
    const ct = closingTransactionFor("2026-08", "s1", BATCHES, 0, "2026-09-01 09:00:00");
    expect(ct.balances).toEqual(recomputeAsAt(BATCHES, "2026-08-31"));
  });

  it("carries the period's Suspense total GROSS, on the closing transaction", () => {
    // d15, step 20. It lives here and not on the seal, so there is one figure
    // in one place — a total two artifacts each held could disagree.
    const ct = closingTransactionFor("2026-08", "s1", BATCHES, 6, "2026-09-01 09:00:00");
    expect(ct.suspenseGross).toBe(6);
  });

  it("names the seal that produced it, so an unseal can rewrite it", () => {
    const ct = closingTransactionFor("2026-08", "s1", BATCHES, 0, "2026-09-01 09:00:00");
    expect(ct.sealId).toBe("s1");
  });

  it("excludes the next period's activity from the period's own close", () => {
    const ct = closingTransactionFor("2026-08", "s1", BATCHES, 0, "2026-09-01 09:00:00");
    expect(totalOf(ct.balances.filter((b) => b.accountId === "6400"))).toBe(1200);
  });
});

describe("M-08 A-76 — a divergence, and the flag with no actor", () => {
  const CT = closingTransactionFor("2026-08", "s1", BATCHES, 0, "2026-09-01 09:00:00");

  it("finds nothing while the journal is unchanged", () => {
    expect(divergences(CT, BATCHES)).toEqual([]);
    expect(divergenceFlag(CT, BATCHES, [seal("s1", "2026-08")], [], "2026-10-01")).toBeUndefined();
  });

  it("catches a line that appeared inside a sealed period", () => {
    // This is the defect it exists for. d11 says nothing may write into a
    // sealed period BY ANY ROUTE, so a new line inside one means a route
    // exists that should not — and checking only the stored keys would miss it.
    const tampered = [...BATCHES, batch("x", [line("6400", "2026-08-20", 50, 0)])];
    const found = divergences(CT, tampered);
    expect(found).toHaveLength(1);
    expect(found[0].accountId).toBe("6400");
    expect(found[0].stored).toBe(1200);
    expect(found[0].recomputed).toBe(1250);
    expect(found[0].difference).toBe(50);
  });

  it("catches a key the recomputation produces that the stored set does not", () => {
    const tampered = [...BATCHES, batch("x", [line("7000", "2026-08-20", 90, 0)])];
    const found = divergences(CT, tampered);
    expect(found.map((d) => d.accountId)).toEqual(["7000"]);
    expect(found[0].stored).toBe(0);
    expect(found[0].recomputed).toBe(90);
  });

  it("raises a flag with a NULL actor and no invitation to fix it", () => {
    // A-68, A-76 — no Manager can cause one and none can clear one.
    const tampered = [...BATCHES, batch("x", [line("6400", "2026-08-20", 50, 0)])];
    const flag = divergenceFlag(CT, tampered, [seal("s1", "2026-08")], [], "2026-10-01");
    expect(flag?.kind).toBe("ledger-balance-divergence");
    expect(flag?.recordedBy).toBeUndefined();
    expect(flag?.acknowledged).toBe(false);
    expect(flag?.summary).toContain("2026-08");
    expect(flag?.summary).toContain("50.00");
  });

  it("raises NOTHING on an unsealed period, where staleness is the design", () => {
    // d29 has the most recently sealed period unsealed and its closing
    // transaction rewritten, and A-76 narrows to exactly that. A flag here
    // would fire when nothing is wrong, which is A-71's warning from the other
    // side: it trains people to acknowledge without reading.
    const tampered = [...BATCHES, batch("x", [line("6400", "2026-08-20", 50, 0)])];
    const seals = [seal("s1", "2026-08")];
    expect(divergenceFlag(CT, tampered, seals, [unseal("u1", "s1")], "2026-10-01")).toBeUndefined();
  });
});

describe("M-08 step 24 — balance forward · activity · new balance forward", () => {
  const seals = [seal("s-jul", "2026-07"), seal("s-aug", "2026-08")];
  const closings = [
    closingTransactionFor("2026-07", "s-jul", BATCHES, 0, "2026-08-01 09:00:00"),
    closingTransactionFor("2026-08", "s-aug", BATCHES, 0, "2026-09-01 09:00:00"),
  ];

  it("reads all three when both periods are sealed", () => {
    const e = accountEnquiry("2026-08", BATCHES, closings, seals, [], { accountId: "6400" });
    expect(e.balanceForward).toBe(0);
    expect(e.activity).toBe(1200);
    expect(e.newBalanceForward).toBe(1200);
    expect(e.unavailable).toBeUndefined();
  });

  it("gives the ACTIVITY with no seal at all, and withholds the other two", () => {
    // Step 24: "The middle term is true without an opening position and without
    // a seal; the other two are not."
    const e = accountEnquiry("2026-09", BATCHES, [], [], [], { accountId: "6400" });
    expect(e.activity).toBe(1200);
    expect(e.balanceForward).toBeUndefined();
    expect(e.newBalanceForward).toBeUndefined();
  });

  it("says WHY a balance forward is absent rather than showing a zero", () => {
    // A zero reads as "the account was empty", which is a claim. Absent reads
    // as "this system cannot tell you", which is the truth.
    const e = accountEnquiry("2026-09", BATCHES, [], [], [], { accountId: "6400" });
    expect(e.unavailable).toContain("2026-08 has never been sealed");
    expect(e.unavailable).toContain("2026-09 is not sealed");
    expect(e.unavailable).toContain("activity below is complete");
  });

  it("withholds the new balance forward alone while the period is open", () => {
    const e = accountEnquiry("2026-09", BATCHES, closings, seals, [], { accountId: "6400" });
    expect(e.balanceForward).toBe(1200);
    expect(e.newBalanceForward).toBeUndefined();
    expect(e.unavailable).toContain("2026-09 is not sealed");
    expect(e.unavailable).not.toContain("never been sealed");
  });

  it("stops reading a stored figure the moment its period is unsealed", () => {
    const e = accountEnquiry("2026-08", BATCHES, closings, seals, [unseal("u1", "s-aug")], {
      accountId: "6400",
    });
    expect(e.balanceForward).toBe(0);
    expect(e.activity).toBe(1200);
    expect(e.newBalanceForward).toBeUndefined();
  });

  it("ignores a closing transaction from a seal that is no longer live", () => {
    // A-75 — re-sealing appends a second seal. The enquiry must read the
    // closing transaction of the LIVE seal, not the first one it finds.
    const resealed = [...seals, seal("s-aug-2", "2026-08")];
    const stale = closings; // still keyed to s-aug
    const e = accountEnquiry("2026-08", BATCHES, stale, resealed, [unseal("u1", "s-aug")], {
      accountId: "6400",
    });
    expect(e.newBalanceForward).toBeUndefined();
  });

  it("shows every line behind the figures, in date order", () => {
    const e = accountEnquiry("2026-08", BATCHES, closings, seals, [], { accountId: "1010" });
    expect(e.lines.map((l) => l.businessDate)).toEqual(["2026-08-01", "2026-08-15"]);
    expect(e.activity).toBe(-1600);
  });

  it("narrows by section without changing what the figures mean", () => {
    const sectioned = [
      batch("s1", [line("4000", "2026-08-01", 0, 300, { section: "ROCK" })]),
      batch("s2", [line("4000", "2026-08-02", 0, 200, { section: "JAZZ" })]),
    ];
    const ct = [closingTransactionFor("2026-08", "s-aug", sectioned, 0, "2026-09-01 09:00:00")];
    const all = accountEnquiry("2026-08", sectioned, ct, seals, [], { accountId: "4000" });
    const rock = accountEnquiry("2026-08", sectioned, ct, seals, [], {
      accountId: "4000",
      section: "ROCK",
    });
    expect(all.activity).toBe(-500);
    expect(all.newBalanceForward).toBe(-500);
    expect(rock.activity).toBe(-300);
    expect(rock.newBalanceForward).toBe(-300);
    expect(rock.lines).toHaveLength(1);
  });
});

describe("M-08 — activity in a range stands alone", () => {
  it("counts only what falls inside, at both ends", () => {
    expect(totalOf(activityBetween(BATCHES, "2026-08-01", "2026-08-31", { accountId: "1010" }))).toBe(
      -1600,
    );
    expect(totalOf(activityBetween(BATCHES, "2026-08-02", "2026-08-31", { accountId: "1010" }))).toBe(
      -400,
    );
    expect(totalOf(activityBetween(BATCHES, "2026-09-01", "2026-09-30", { accountId: "1010" }))).toBe(
      -1200,
    );
  });
});
