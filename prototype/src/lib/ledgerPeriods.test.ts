import { describe, expect, it } from "vitest";
import type { LedgerPeriodSeal, LedgerPeriodUnseal, LedgerYearFiling } from "../data/types";
import {
  fiscalYearEndFor,
  isFiled,
  isSealed,
  isYearEnd,
  liveSeal,
  markFiledRefusal,
  mostRecentlySealed,
  nextPeriod,
  oldestUnsealed,
  periodEnd,
  periodOf,
  periodStart,
  previousPeriod,
  sealRefusal,
  sealReport,
  sealedPeriods,
  unsealRefusal,
} from "./ledgerPeriods";

const seal = (id: string, period: string, suspenseGross = 0): LedgerPeriodSeal => ({
  id,
  period,
  sealedAt: `${period}-28 17:00:00`,
  actorInitials: "WW",
  authorizedByInitials: "WW",
  suspenseGross,
});

const unseal = (id: string, sealId: string, reason = "Accountant's adjustment"): LedgerPeriodUnseal => ({
  id,
  sealId,
  unsealedAt: "2026-09-17 10:00:00",
  actorInitials: "WW",
  authorizedByInitials: "WW",
  reason,
});

const filing = (fiscalYearEnd: string): LedgerYearFiling => ({
  id: `f-${fiscalYearEnd}`,
  fiscalYearEnd,
  filedAt: "2026-06-30 09:00:00",
  actorInitials: "WW",
  authorizedByInitials: "WW",
});

const DEC = 12;

describe("M-08 — a period is its transaction date and nothing else", () => {
  it("derives the period by slicing the business date", () => {
    // M-08 Requirements: there is no separate field saying which month an entry
    // is filed in, and M-07 d15's `writtenAt` never affects where it lands.
    // "The September date IS what puts it in September."
    expect(periodOf("2026-09-17")).toBe("2026-09");
    expect(periodOf("2026-01-01")).toBe("2026-01");
  });

  it("bounds a period by the calendar, including February in a leap year", () => {
    expect(periodStart("2026-09")).toBe("2026-09-01");
    expect(periodEnd("2026-09")).toBe("2026-09-30");
    expect(periodEnd("2026-02")).toBe("2026-02-28");
    expect(periodEnd("2028-02")).toBe("2028-02-29");
    expect(periodEnd("2026-12")).toBe("2026-12-31");
  });

  it("walks across a year boundary in both directions", () => {
    expect(previousPeriod("2026-01")).toBe("2025-12");
    expect(nextPeriod("2026-12")).toBe("2027-01");
    expect(nextPeriod("2026-09")).toBe("2026-10");
  });

  it("sorts lexically in calendar order, which is what every comparison rests on", () => {
    const shuffled = ["2026-10", "2026-02", "2025-12", "2026-01"];
    expect([...shuffled].sort()).toEqual(["2025-12", "2026-01", "2026-02", "2026-10"]);
  });
});

describe("M-08 d4 — a period is SEALED, and the word *closed* is reserved elsewhere", () => {
  it("never says *close* in anything a Manager reads", () => {
    // d4: `close` is the end-of-day close (M-03) and `CloseBatch` is its
    // artifact, so a month close and a day close would be the same word for
    // two acts that differ in scope, frequency, actor and reversibility.
    // Reserved in lexicon §15. d4's accepted consequence is that "every screen
    // has to teach it" — which starts with every string this module emits.
    const seals = [seal("s1", "2026-08"), seal("s2", "2026-12")];
    const messages = [
      sealRefusal("2026-08", seals, []),
      unsealRefusal("2026-09", seals, [], [], DEC, "r"),
      unsealRefusal("2026-08", seals, [], [], DEC, "r"),
      unsealRefusal("2026-12", seals, [], [filing("2026-12")], DEC, "r"),
      unsealRefusal("2026-12", seals, [], [], DEC, ""),
      markFiledRefusal("2026-12", seals, [], [filing("2026-12")]),
      markFiledRefusal("2027-12", seals, [], []),
    ].filter((m): m is string => m !== undefined);

    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) expect(m.toLowerCase()).not.toContain("clos");
  });
});

describe("M-08 d5, M-06 d64 — the fiscal year is read from a setting, never asked", () => {
  it("puts a period in the year that ENDS on or after it", () => {
    // December year end: the calendar year.
    expect(fiscalYearEndFor("2026-09", DEC)).toBe("2026-12");
    expect(fiscalYearEndFor("2026-12", DEC)).toBe("2026-12");
    // A June year end: September 2026 belongs to the year ending June 2027.
    expect(fiscalYearEndFor("2026-09", 6)).toBe("2027-06");
    expect(fiscalYearEndFor("2026-03", 6)).toBe("2026-06");
    expect(fiscalYearEndFor("2026-06", 6)).toBe("2026-06");
  });

  it("knows which seal is a year end, which is the check d5 bought instead of a prompt", () => {
    expect(isYearEnd("2026-12", DEC)).toBe(true);
    expect(isYearEnd("2026-11", DEC)).toBe(false);
    expect(isYearEnd("2026-06", 6)).toBe(true);
  });
});

describe("M-08 A-75 — sealed state is derived from rows, never stored", () => {
  it("is sealed iff a seal has no unseal against it", () => {
    const seals = [seal("s1", "2026-08")];
    expect(isSealed("2026-08", seals, [])).toBe(true);
    expect(isSealed("2026-08", seals, [unseal("u1", "s1")])).toBe(false);
  });

  it("re-sealing appends a second seal, and the history survives", () => {
    // A `sealed` boolean would have been true, false and true, and remembered
    // none of it. Three rows remember all three acts.
    const seals = [seal("s1", "2026-08"), seal("s2", "2026-08")];
    const unseals = [unseal("u1", "s1")];
    expect(isSealed("2026-08", seals, unseals)).toBe(true);
    expect(liveSeal("2026-08", seals, unseals)?.id).toBe("s2");
    expect(seals).toHaveLength(2);
  });

  it("an unseal names the SEAL it reverses, so it cannot reverse the wrong one", () => {
    const seals = [seal("s1", "2026-07"), seal("s2", "2026-08")];
    expect(isSealed("2026-07", seals, [unseal("u1", "s2")])).toBe(true);
    expect(isSealed("2026-08", seals, [unseal("u1", "s2")])).toBe(false);
  });

  it("lists sealed periods earliest first and skips the reversed ones", () => {
    const seals = [seal("s1", "2026-06"), seal("s2", "2026-08"), seal("s3", "2026-07")];
    expect(sealedPeriods(seals, [])).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(sealedPeriods(seals, [unseal("u1", "s2")])).toEqual(["2026-06", "2026-07"]);
  });
});

describe("M-08 A-75 — a second live seal is refused, and the balance-forwards are not doubled", () => {
  it("refuses a second seal of a period that is already sealed", () => {
    const seals = [seal("s1", "2026-08")];
    expect(sealRefusal("2026-08", seals, [])).toBe("2026-08 is already sealed.");
  });

  it("permits the seal again once it has been unsealed", () => {
    const seals = [seal("s1", "2026-08")];
    expect(sealRefusal("2026-08", seals, [unseal("u1", "s1")])).toBeUndefined();
  });

  it("carries the live seal's Suspense total GROSS onto the closing transaction", () => {
    // M-07 d25 — short three dollars on one date and over three on another is
    // two defects, and a net of zero is the one answer that hides both.
    const seals = [seal("s1", "2026-08", 6)];
    expect(liveSeal("2026-08", seals, [])?.suspenseGross).toBe(6);
  });
});

describe("M-08 d15, step 17 — what a seal reports, and what it refuses", () => {
  it("reports every failure together rather than stopping at the first", () => {
    const blockers = ["A posting on 2026-08-04 does not balance.", "Line 3 has no location."];
    expect(sealReport("2026-08", DEC, blockers).blocking).toEqual(blockers);
    expect(sealRefusal("2026-08", [], [], blockers)).toContain("does not balance");
    expect(sealRefusal("2026-08", [], [], blockers)).toContain("no location");
  });

  it("does NOT block on a Suspense line — it reports it and carries it", () => {
    // d15: refusing would deadlock the books. M-07 d10 records that no Manager
    // action can create a Suspense balance and none can clear one, so a seal
    // that refused on Suspense is a seal no Manager could ever satisfy.
    const report = sealReport("2026-08", DEC, [], 6);
    expect(report.suspenseGross).toBe(6);
    expect(report.blocking).toEqual([]);
    expect(sealRefusal("2026-08", [], [], [])).toBeUndefined();
  });

  it("says a year end is coming BEFORE it happens, rather than asking", () => {
    // d17, step 21 — "the system knows which period this is and says so before
    // it happens, rather than asking."
    expect(sealReport("2026-12", DEC).sealsFiscalYear).toBe(true);
    expect(sealReport("2026-11", DEC).sealsFiscalYear).toBe(false);
  });
});

describe("M-08 d29 — only the most recently sealed period may be unsealed", () => {
  const seals = [seal("s1", "2026-06"), seal("s2", "2026-07"), seal("s3", "2026-08")];

  it("names the latest sealed period and nothing else", () => {
    expect(mostRecentlySealed(seals, [])).toBe("2026-08");
  });

  it("refuses an older period and says which one to unseal first", () => {
    // d29 supersedes d16's *any sealed period*. "The friction is the guard."
    const refusal = unsealRefusal("2026-06", seals, [], [], DEC, "Fix the rent");
    expect(refusal).toBe("Only the most recently sealed period can be unsealed. Unseal 2026-08 first.");
  });

  it("permits the latest, and the act repeats to walk backwards", () => {
    expect(unsealRefusal("2026-08", seals, [], [], DEC, "Fix the rent")).toBeUndefined();

    // Unseal August; July is now the most recent, and reachable.
    const afterAugust = [unseal("u1", "s3")];
    expect(mostRecentlySealed(seals, afterAugust)).toBe("2026-07");
    expect(unsealRefusal("2026-07", seals, afterAugust, [], DEC, "Fix the rent")).toBeUndefined();
    expect(unsealRefusal("2026-06", seals, afterAugust, [], DEC, "Fix the rent")).toContain("2026-07 first");
  });

  it("refuses a period that is not sealed at all", () => {
    expect(unsealRefusal("2026-09", seals, [], [], DEC, "Fix the rent")).toBe("2026-09 is not sealed.");
  });
});

describe("M-08 d18 — an unseal needs a reason, and blank is refused rather than defaulted", () => {
  const seals = [seal("s1", "2026-08")];

  it("refuses a blank reason", () => {
    expect(unsealRefusal("2026-08", seals, [], [], DEC, "")).toBe("An unseal needs a reason.");
    expect(unsealRefusal("2026-08", seals, [], [], DEC, "   ")).toBe("An unseal needs a reason.");
  });

  it("accepts a reason and records both names on the artifact", () => {
    expect(unsealRefusal("2026-08", seals, [], [], DEC, "Depreciation")).toBeUndefined();
    const u = unseal("u1", "s1", "Depreciation");
    expect(u.reason).toBe("Depreciation");
    expect(u.actorInitials).toBe("WW");
    expect(u.authorizedByInitials).toBe("WW");
  });
});

describe("M-08 d22 — a filed year never reopens, and neither does a month inside it", () => {
  const seals = [seal("s1", "2026-11"), seal("s2", "2026-12")];
  const filings = [filing("2026-12")];

  it("refuses the unseal of the filed year itself", () => {
    const refusal = unsealRefusal("2026-12", seals, [], filings, DEC, "Reclassify");
    expect(refusal).toBe(
      "The fiscal year ending 2026-12 has been marked filed, so 2026-12 can never be unsealed.",
    );
  });

  it("refuses a MONTH inside the filed year, which is the half step 23 adds", () => {
    expect(isFiled("2026-11", filings, DEC)).toBe(true);
    expect(unsealRefusal("2026-11", seals, [], filings, DEC, "Reclassify")).toContain("marked filed");
  });

  it("does not reach a month in an unfiled year", () => {
    expect(isFiled("2027-03", filings, DEC)).toBe(false);
  });

  it("refuses before the most-recent check, so nobody walks back to a wall", () => {
    // 2026-11 is not the most recently sealed period either, but the refusal a
    // Manager gets is the one that never lifts — otherwise they unseal December
    // first and hit the filed wall anyway.
    expect(unsealRefusal("2026-11", seals, [], filings, DEC, "Reclassify")).toContain("filed");
    expect(unsealRefusal("2026-11", seals, [], filings, DEC, "Reclassify")).not.toContain("first");
  });

  it("follows a non-December year end into the right year", () => {
    const juneFilings = [filing("2026-06")];
    expect(isFiled("2026-02", juneFilings, 6)).toBe(true);
    expect(isFiled("2026-09", juneFilings, 6)).toBe(false);
  });
});

describe("M-08 d22 — marking a year filed", () => {
  const seals = [seal("s1", "2026-12")];

  it("refuses a second filing of the same year", () => {
    const refusal = markFiledRefusal("2026-12", seals, [], [filing("2026-12")]);
    expect(refusal).toBe("The fiscal year ending 2026-12 is already marked filed.");
  });

  it("permits a sealed year that has not been filed", () => {
    expect(markFiledRefusal("2026-12", seals, [], [])).toBeUndefined();
  });

  it("refuses an unsealed year — INFERRED, and not a recorded decision", () => {
    // d22 says a year is marked filed "when the return has gone in" and says
    // nothing about what state the year must be in first. This refusal is an
    // inference and is carried as an open question rather than as settled.
    expect(markFiledRefusal("2026-12", [], [], [])).toBe(
      "Seal 2026-12 before marking the year filed.",
    );
  });
});

describe("M-08 step 16 — the oldest unsealed month is what Seal a period offers", () => {
  it("offers the first unsealed month after the books start", () => {
    const seals = [seal("s1", "2026-06"), seal("s2", "2026-07")];
    expect(oldestUnsealed("2026-06", "2026-09", seals, [])).toBe("2026-08");
  });

  it("offers the first period when nothing is sealed", () => {
    expect(oldestUnsealed("2026-06", "2026-09", [], [])).toBe("2026-06");
  });

  it("offers a period that has been unsealed again", () => {
    const seals = [seal("s1", "2026-06"), seal("s2", "2026-07")];
    expect(oldestUnsealed("2026-06", "2026-09", seals, [unseal("u1", "s1")])).toBe("2026-06");
  });

  it("offers nothing once every month to date is sealed", () => {
    const seals = [seal("s1", "2026-06"), seal("s2", "2026-07")];
    expect(oldestUnsealed("2026-06", "2026-07", seals, [])).toBeUndefined();
  });

  it("offers nothing before the opening position, because there is no first period yet", () => {
    // A-73 bounds a typed date below by the opening position's date. Without
    // one there is no oldest unsealed month, only an unbounded past.
    expect(oldestUnsealed(undefined, "2026-09", [], [])).toBeUndefined();
  });
});
