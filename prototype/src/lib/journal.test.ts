import { describe, expect, it } from "vitest";
import { assembleJournal, batchTotals, credit, datesIn, debit, isImbalanced, type Posting } from "./journal";

const assemble = (postings: Posting[]) =>
  assembleJournal({ id: "j-1", source: "close:b-1", writtenAt: "2026-09-16 18:00:00", postings, suspenseAccountId: "acc-suspense" });

describe("M-07 d14 — lines group by (business date, account), and a batch is not one date", () => {
  it("nets two postings to the same account on the same day into one line", () => {
    // A Section that sold $40 and took a $12 return the same day moved $28.
    // Two lines sharing an account is the shape d14 exists to prevent.
    const b = assemble([
      credit("acc-vinyl", "2026-09-15", 40, "CAD", "Revenue — VINYL"),
      debit("acc-vinyl", "2026-09-15", 12, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-15", 28, "CAD", "Undeposited funds — Cash"),
    ]);

    const vinyl = b.lines.filter((l) => l.accountId === "acc-vinyl");
    expect(vinyl).toHaveLength(1);
    expect(vinyl[0].credit).toBe(28);
    expect(vinyl[0].debit).toBe(0);
  });

  it("keeps the same account on two days as two lines", () => {
    // M-03 step 2 closes ALL Current Sales, not today's — so a close nobody
    // ran on Monday sweeps Monday and Tuesday into one batch. Dating both at
    // close reports Monday's revenue on Tuesday, which is harmless most weeks
    // and wrong across a month boundary.
    const b = assemble([
      credit("acc-vinyl", "2026-09-14", 40, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-14", 40, "CAD", "Undeposited funds — Cash"),
      credit("acc-vinyl", "2026-09-15", 25, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-15", 25, "CAD", "Undeposited funds — Cash"),
    ]);

    expect(datesIn(b)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(b.lines.filter((l) => l.accountId === "acc-vinyl")).toHaveLength(2);
  });

  it("does not net two currencies into one line (d17 — nothing is converted)", () => {
    const b = assemble([
      debit("acc-inventory", "2026-09-15", 100, "CAD", "Inventory"),
      debit("acc-inventory", "2026-09-15", 80, "USD", "Inventory"),
      credit("acc-ap", "2026-09-15", 100, "CAD", "Accounts payable"),
      credit("acc-ap", "2026-09-15", 80, "USD", "Accounts payable"),
    ]);

    const inv = b.lines.filter((l) => l.accountId === "acc-inventory");
    expect(inv).toHaveLength(2);
    expect(inv.map((l) => l.currency).sort()).toEqual(["CAD", "USD"]);
  });

  it("drops a group that nets to zero rather than emitting a $0.00 row", () => {
    const b = assemble([
      credit("acc-vinyl", "2026-09-15", 40, "CAD", "Revenue — VINYL"),
      debit("acc-vinyl", "2026-09-15", 40, "CAD", "Revenue — VINYL"),
    ]);

    expect(b.lines).toEqual([]);
  });
});

describe("M-07 d10 — an unbalanced journal posts its difference to Suspense and is still written", () => {
  it("balances the batch by construction and records that it had to", () => {
    const b = assemble([
      credit("acc-vinyl", "2026-09-15", 40, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-15", 37, "CAD", "Undeposited funds — Cash"),
    ]);

    expect(isImbalanced(b)).toBe(true);
    expect(b.suspense).toBe(3);
    const { debit: d, credit: c } = batchTotals(b);
    expect(d).toBe(c);
    const susp = b.lines.find((l) => l.accountId === "acc-suspense")!;
    expect(susp.debit).toBe(3);
    expect(susp.businessDate).toBe("2026-09-15");
  });

  it("stays silent when the arithmetic agrees", () => {
    const b = assemble([
      credit("acc-vinyl", "2026-09-15", 40, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-15", 40, "CAD", "Undeposited funds — Cash"),
    ]);

    expect(isImbalanced(b)).toBe(false);
    expect(b.suspense).toBeUndefined();
    expect(b.lines.some((l) => l.accountId === "acc-suspense")).toBe(false);
  });

  it("does not raise a defect out of floating point", () => {
    // Three lines at 0.1 against one at 0.3 is exactly 0 in cents and is NOT
    // zero in IEEE 754. d10 makes a non-zero Suspense figure always a defect in
    // this system, so a journal that drifted by a hundredth would file a bug
    // report about itself — which is why every sum here runs in integer cents.
    const b = assemble([
      debit("acc-a", "2026-09-15", 0.1, "CAD", "a"),
      debit("acc-a", "2026-09-15", 0.1, "CAD", "a"),
      debit("acc-a", "2026-09-15", 0.1, "CAD", "a"),
      credit("acc-b", "2026-09-15", 0.3, "CAD", "b"),
    ]);

    expect(isImbalanced(b)).toBe(false);
  });

  it("balances EACH business date, so a range export of one day is still a valid document", () => {
    // d25. d10 speaks of "the journal", which reads as the batch — but step 15
    // gathers lines by the dates they CARRY, so a range covering Monday and not
    // Tuesday slices a two-day batch. A Suspense line sitting on Tuesday would
    // leave Monday's export unbalanced, which is the exact failure Suspense
    // exists to make impossible.
    const b = assemble([
      credit("acc-vinyl", "2026-09-14", 40, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-14", 37, "CAD", "Undeposited funds — Cash"),
      credit("acc-vinyl", "2026-09-15", 25, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-15", 25, "CAD", "Undeposited funds — Cash"),
    ]);

    for (const date of datesIn(b)) {
      const onDate = b.lines.filter((l) => l.businessDate === date);
      const d = onDate.reduce((s, l) => s + l.debit, 0);
      const c = onDate.reduce((s, l) => s + l.credit, 0);
      expect(d).toBeCloseTo(c, 10);
    }
    // And the Suspense line lands on the day that was short, not on the batch.
    const susp = b.lines.filter((l) => l.accountId === "acc-suspense");
    expect(susp).toHaveLength(1);
    expect(susp[0].businessDate).toBe("2026-09-14");
  });

  it("reports two offsetting daily differences rather than netting them to nothing", () => {
    // d25's accepted consequence, and the first thing per-date balancing
    // changes. Short $3 on Monday, over $3 on Tuesday: two Suspense lines get
    // written, and a NET total reports zero — so the batch would read as
    // balanced, no flag would be raised, and two defect lines would sit in the
    // file unmentioned. Two errors are not an absence of error.
    const b = assemble([
      credit("acc-vinyl", "2026-09-14", 40, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-14", 37, "CAD", "Undeposited funds — Cash"),
      credit("acc-vinyl", "2026-09-15", 25, "CAD", "Revenue — VINYL"),
      debit("acc-cash", "2026-09-15", 28, "CAD", "Undeposited funds — Cash"),
    ]);

    expect(b.lines.filter((l) => l.accountId === "acc-suspense")).toHaveLength(2);
    expect(isImbalanced(b)).toBe(true);
    expect(b.suspense).toBe(6); // gross — $3 each way, not $0
    const { debit: d, credit: c } = batchTotals(b);
    expect(d).toBe(c);
  });
});

describe("a line carries its own facts", () => {
  it("never infers a date or a currency from the batch (d14, d17)", () => {
    const b = assemble([
      debit("acc-inventory", "2026-09-10", 80, "USD", "Inventory"),
      credit("acc-ap", "2026-09-10", 80, "USD", "Accounts payable"),
    ]);

    // The batch was written on the 16th. Every line is dated the 10th, in USD.
    expect(b.writtenAt).toBe("2026-09-16 18:00:00");
    expect(b.lines.every((l) => l.businessDate === "2026-09-10")).toBe(true);
    expect(b.lines.every((l) => l.currency === "USD")).toBe(true);
  });

  it("names the artifact behind it (d15)", () => {
    const b = assemble([debit("acc-a", "2026-09-15", 1, "CAD", "a"), credit("acc-b", "2026-09-15", 1, "CAD", "b")]);
    expect(b.source).toBe("close:b-1");
  });
});
