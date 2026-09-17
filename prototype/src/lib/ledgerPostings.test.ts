import { describe, expect, it } from "vitest";
import type { GLAccount, GLRole, LedgerPeriodSeal, LedgerPeriodUnseal } from "../data/types";
import {
  applyEdit,
  balanceRefusal,
  dateRefusal,
  editRefusal,
  offerableAccounts,
  postingBalance,
  postingJournal,
  postingRefusal,
  postingRefusals,
  untypeableReason,
  type LedgerPosting,
  type PostingContext,
  type TypedPostingLine,
} from "./ledgerPostings";

const acct = (id: string, name: string, role?: GLRole, active = true): GLAccount => ({
  id,
  name,
  number: id,
  active,
  ...(role ? { role } : { type: "expense" as const }),
});

const ACCOUNTS: GLAccount[] = [
  acct("1010", "Chequing", "bank"),
  acct("1200", "Inventory", "inventory"),
  acct("1900", "Suspense", "suspense"),
  acct("2100", "Accounts payable", "accounts-payable"),
  acct("2150", "Accounts payable — opening", "accounts-payable-opening"),
  acct("3200", "Retained earnings", "retained-earnings"),
  acct("6400", "Rent"),
  acct("6410", "Utilities"),
  acct("6999", "Old expense code", undefined, false),
];

const seal = (id: string, period: string): LedgerPeriodSeal => ({
  id,
  period,
  sealedAt: `${period}-28 17:00:00`,
  actorInitials: "WW",
  authorizedByInitials: "WW",
  suspenseGross: 0,
});

const line = (
  accountId: string,
  amount: number,
  extra: Partial<TypedPostingLine> = {},
): TypedPostingLine => ({ accountId, amount, location: "0", memo: "Rent", ...extra });

const ctx = (over: Partial<PostingContext> = {}): PostingContext => ({
  accounts: ACCOUNTS,
  openingDate: "2026-05-31",
  seals: [],
  unseals: [],
  locations: ["0"],
  sections: ["ROCK", "JAZZ"],
  ...over,
});

const posting = (over: Partial<LedgerPosting> = {}): LedgerPosting => ({
  id: "p1",
  businessDate: "2026-09-01",
  writtenAt: "2026-09-01 09:00:00",
  actorInitials: "WW",
  authorizedByInitials: "WW",
  lines: [line("6400", 1200), line("1010", -1200, { memo: "Rent" })],
  ...over,
});

describe("M-08 d10 — an unbalanced posting is refused, and the refusal is useful", () => {
  it("shows the amount still needed and which side, continuously", () => {
    // Step 12 — the running indicator, which is the same figure the refusal
    // carries. Two functions computing two numbers would be worse than either.
    const b = postingBalance([line("6400", 1200), line("1010", -900)]);
    expect(b.debits).toBe(1200);
    expect(b.credits).toBe(900);
    expect(b.needed).toBe(300);
    expect(b.side).toBe("credit");
    expect(b.balanced).toBe(false);
  });

  it("names the debit side when the credits are heavier", () => {
    const b = postingBalance([line("6400", 900), line("1010", -1200)]);
    expect(b.needed).toBe(300);
    expect(b.side).toBe("debit");
  });

  it("says Balanced with no side when it balances", () => {
    const b = postingBalance([line("6400", 1200), line("1010", -1200)]);
    expect(b.balanced).toBe(true);
    expect(b.side).toBeNull();
    expect(b.needed).toBe(0);
  });

  it("refuses with the amount and the side, not merely with no", () => {
    // d10's accepted consequence: this is the one place in the system that
    // BLOCKS rather than proceeding-and-recording (A-28a), "so the refusal has
    // to earn it by being useful".
    const why = balanceRefusal([line("6400", 1200), line("1010", -900)]);
    expect(why).toBe("This posting is out by 300.00. It needs another 300.00 on the credit side.");
  });

  it("balances in cents, so a posting is never refused for being binary", () => {
    // 0.1 + 0.2 !== 0.3 in float. The ledger must not care.
    const b = postingBalance([line("6400", 0.1), line("6410", 0.2), line("1010", -0.3)]);
    expect(b.balanced).toBe(true);
  });

  it("does NOT send the difference to Suspense — that is what keeps M-07 d10 true", () => {
    // d10: a typo routed to Suspense would make "always a defect in this
    // system, never a data-entry mistake" false the first time it happened.
    const draft = { businessDate: "2026-09-01", lines: [line("6400", 1200), line("1010", -900)] };
    expect(postingRefusal(draft, ctx())).toContain("out by 300.00");
    expect(() =>
      postingJournal(posting({ lines: draft.lines }), "1900", "CAD"),
    ).toThrow(/must balance/);
  });
});

describe("M-08 d13, d14 — the accounts a Manager may not type into", () => {
  it("refuses retained earnings, which the year-end seal posts", () => {
    expect(untypeableReason(acct("3200", "Retained earnings", "retained-earnings"))).toContain(
      "kept by the system",
    );
  });

  it("refuses Accounts payable, because d7 rests a permanent invariant on it", () => {
    // "one typed line breaks that invariant on its first use."
    const why = untypeableReason(acct("2100", "Accounts payable", "accounts-payable"));
    expect(why).toContain("payables balance exactly");
    expect(why).toContain("opening account");
  });

  it("PERMITS Accounts payable — opening, which is drawn down by hand (d7)", () => {
    expect(
      untypeableReason(acct("2150", "A/P — opening", "accounts-payable-opening")),
    ).toBeUndefined();
  });

  it("PERMITS Inventory, which d13 says reverses the drafting instinct", () => {
    // "a dead-stock write-down is precisely the case where book value should
    // diverge from the shelf."
    expect(untypeableReason(acct("1200", "Inventory", "inventory"))).toBeUndefined();
  });

  it("refuses Suspense — d14, and NOT RATIFIED", () => {
    const why = untypeableReason(acct("1900", "Suspense", "suspense"));
    expect(why).toContain("its own act");
    expect(why).toContain("not ratified");
  });

  it("refuses the gift card liability — PROPOSED by the user, not yet a decision", () => {
    // 2026-09-17. d13's own argument with E-06 in M-05's place: the balance IS
    // the sum of what is outstanding on live cards, so one typed line makes the
    // books disagree with the cards. d13 does not name this role, so it wants a
    // decision of its own rather than living only in this file.
    const why = untypeableReason(acct("2300", "Gift cards", "gift-card-liability"));
    expect(why).toContain("kept by the system");
    expect(why).toContain("never typed");
  });

  it("still PERMITS the accounts d13 considered and allowed", () => {
    // The gift card refusal is an addition, not a widening of d13 into every
    // system-written account. Inventory is the one d13 permitted on purpose.
    expect(untypeableReason(acct("1200", "Inventory", "inventory"))).toBeUndefined();
    expect(untypeableReason(acct("2150", "A/P — opening", "accounts-payable-opening"))).toBeUndefined();
  });

  it("offers neither an untypeable account nor a deactivated one, for different reasons", () => {
    // M-06 d9 / M-07 d18 — active governs what is OFFERED and never what
    // resolves. The two filters are not the same rule.
    const offered = offerableAccounts(ACCOUNTS).map((a) => a.id);
    expect(offered).toContain("1200"); // Inventory — typeable
    expect(offered).toContain("2150"); // A/P opening — typeable
    expect(offered).toContain("6400"); // Rent
    expect(offered).not.toContain("2100"); // A/P — d13
    expect(offered).not.toContain("3200"); // Retained earnings — d13
    expect(offered).not.toContain("1900"); // Suspense — d14
    expect(offered).not.toContain("6999"); // deactivated — M-06 d9
  });

  it("refuses the posting itself, not only the picker — A-74 puts it in the function", () => {
    // A-4, A-48: "a bound enforced in the client is not a bound." An account
    // the picker never offered still has to be refused on the way in.
    const draft = { businessDate: "2026-09-01", lines: [line("2100", 500), line("1010", -500)] };
    expect(postingRefusal(draft, ctx())).toContain("payables balance exactly");
  });

  it("names a deactivated account separately from an untypeable one", () => {
    const draft = { businessDate: "2026-09-01", lines: [line("6999", 500), line("1010", -500)] };
    expect(postingRefusal(draft, ctx())).toContain("has been deactivated");
  });
});

describe("M-08 d11, A-73 — the date is bounded at both ends and unbounded above", () => {
  it("refuses a date inside a sealed period, and says to date it in the open one", () => {
    // "The hydro bill for January arriving in February after January is sealed
    // lands in February."
    const why = dateRefusal("2026-08-14", "2026-05-31", [seal("s1", "2026-08")], []);
    expect(why).toBe("2026-08 is sealed. Date this in the open period instead (d11).");
  });

  it("permits the date again once the period is unsealed", () => {
    const seals = [seal("s1", "2026-08")];
    const unseals: LedgerPeriodUnseal[] = [
      {
        id: "u1",
        sealId: "s1",
        unsealedAt: "2026-09-17 10:00:00",
        actorInitials: "WW",
        authorizedByInitials: "WW",
        reason: "Depreciation",
      },
    ];
    expect(dateRefusal("2026-08-14", "2026-05-31", seals, unseals)).toBeUndefined();
  });

  it("refuses a date on or before the opening position", () => {
    expect(dateRefusal("2026-05-31", "2026-05-31", [], [])).toContain("books start after");
    expect(dateRefusal("2026-04-01", "2026-05-31", [], [])).toContain("books start after");
    expect(dateRefusal("2026-06-01", "2026-05-31", [], [])).toBeUndefined();
  });

  it("PERMITS a future date — A-73 calls that a deliberate choice", () => {
    // "a cheque written today against next month, a known future charge."
    // Its bill is d30: a statement as at a date must exclude what comes after.
    expect(dateRefusal("2099-01-01", "2026-05-31", [], [])).toBeUndefined();
  });

  it("refuses a date that is not a date", () => {
    expect(dateRefusal("", "2026-05-31", [], [])).toBe("A posting needs a date.");
    expect(dateRefusal("14/08/2026", "2026-05-31", [], [])).toBe("A posting needs a date.");
  });

  it("binds nothing below when there is no opening position yet", () => {
    expect(dateRefusal("2020-01-01", undefined, [], [])).toBeUndefined();
  });
});

describe("M-08 d2, d12 — the dimensions beside the account", () => {
  it("requires a location on every line", () => {
    const draft = {
      businessDate: "2026-09-01",
      lines: [line("6400", 1200, { location: "" }), line("1010", -1200)],
    };
    expect(postingRefusal(draft, ctx())).toContain("Line 1 has no location.");
  });

  it("refuses a location that is not one", () => {
    const draft = {
      businessDate: "2026-09-01",
      lines: [line("6400", 1200, { location: "7" }), line("1010", -1200)],
    };
    expect(postingRefusal(draft, ctx())).toContain("7 is not a location.");
  });

  it("permits a blank section, whose blank means *not applicable*", () => {
    // d12 — a bank transfer, a loan repayment and an owner's draw have none.
    const draft = { businessDate: "2026-09-01", lines: [line("6400", 1200), line("1010", -1200)] };
    expect(postingRefusal(draft, ctx())).toBeUndefined();
  });

  it("refuses a named section that does not exist", () => {
    const draft = {
      businessDate: "2026-09-01",
      lines: [line("6400", 1200, { section: "POLKA" }), line("1010", -1200)],
    };
    expect(postingRefusal(draft, ctx())).toContain("POLKA is not a section.");
  });
});

describe("M-08 — every failure is reported together, not one at a time", () => {
  it("reports the date, the account, the location and the balance in one pass", () => {
    // Step 17 has the seal report every failure without stopping at the first.
    // A posting deserves the same: fixing the date only to be told about the
    // location makes a Manager do the work twice for no reason.
    const draft = {
      businessDate: "2026-08-14",
      lines: [line("2100", 1200, { location: "" }), line("1010", -900)],
    };
    const all = postingRefusals(draft, ctx({ seals: [seal("s1", "2026-08")] }));
    expect(all.some((m) => m.includes("sealed"))).toBe(true);
    expect(all.some((m) => m.includes("payables balance"))).toBe(true);
    expect(all.some((m) => m.includes("no location"))).toBe(true);
    expect(all.some((m) => m.includes("out by"))).toBe(true);
    expect(all.length).toBe(4);
  });

  it("refuses a posting with no lines — INFERRED, and not a recorded decision", () => {
    // Nothing in M-08 says a posting needs a line. One with none balances
    // trivially at zero and is plainly not a posting.
    expect(postingRefusal({ businessDate: "2026-09-01", lines: [] }, ctx())).toContain(
      "at least one line",
    );
    expect(
      postingRefusal({ businessDate: "2026-09-01", lines: [line("6400", 0)] }, ctx()),
    ).toContain("at least one line");
  });

  it("accepts an ordinary rent posting", () => {
    const draft = { businessDate: "2026-09-01", lines: [line("6400", 1200), line("1010", -1200)] };
    expect(postingRefusal(draft, ctx())).toBeUndefined();
  });
});

describe("M-08 d3 — editability, NOT RATIFIED", () => {
  it("permits an edit while the period is open", () => {
    expect(editRefusal(posting(), [], [])).toBeUndefined();
  });

  it("refuses an edit once the period is sealed, and names the forward route", () => {
    // d3's shape is the house pattern: A-33a's *immutable while paid* and
    // A-66's *immutable while banked*, here as *immutable once sealed*.
    const why = editRefusal(posting(), [seal("s1", "2026-09")], []);
    expect(why).toContain("2026-09 is sealed");
    expect(why).toContain("posting forward");
  });

  it("appends the before and after rather than overwriting (A-74, A-52)", () => {
    // "a money rule nobody is recorded as having changed is worse than a money
    // rule in code" — which applies harder to an amount than to a setting.
    const before = posting();
    const after = [line("6400", 1300), line("1010", -1300)];
    const edited = applyEdit(before, after, {
      editedAt: "2026-09-02 11:00:00",
      actorInitials: "WW",
      authorizedByInitials: "WW",
    });

    expect(edited.lines[0].amount).toBe(1300);
    expect(edited.log).toHaveLength(1);
    expect(edited.log?.[0].before[0].amount).toBe(1200);
    expect(edited.log?.[0].after[0].amount).toBe(1300);
    expect(edited.log?.[0].authorizedByInitials).toBe("WW");

    // A second edit appends rather than replacing the first.
    const twice = applyEdit(edited, [line("6400", 1400), line("1010", -1400)], {
      editedAt: "2026-09-03 11:00:00",
      actorInitials: "WW",
      authorizedByInitials: "WW",
    });
    expect(twice.log).toHaveLength(2);
    expect(twice.log?.[0].before[0].amount).toBe(1200);
  });
});

describe("M-08 step 15 — the posting joins the journal beside the artifacts'", () => {
  it("names its artifact in the source, so *what is this $52* stays answerable", () => {
    // M-07 d15 — `posting:<id>`, beside `invoice:`, `payment:`, `adjustment:`.
    const b = postingJournal(posting(), "1900", "CAD");
    expect(b.source).toBe("posting:p1");
  });

  it("writes one debit and one credit, each carrying the line's own dimensions", () => {
    const p = posting({
      lines: [line("6400", 1200, { section: "ROCK" }), line("1010", -1200)],
    });
    const b = postingJournal(p, "1900", "CAD");

    const rent = b.lines.find((l) => l.accountId === "6400");
    const bank = b.lines.find((l) => l.accountId === "1010");
    expect(rent?.debit).toBe(1200);
    expect(rent?.credit).toBe(0);
    expect(rent?.section).toBe("ROCK");
    expect(rent?.location).toBe("0");
    expect(bank?.credit).toBe(1200);
    expect(bank?.businessDate).toBe("2026-09-01");
  });

  it("writes no Suspense line, ever", () => {
    // A typed posting balanced before it got here, so there is no difference
    // to route. `assembleJournal` would have routed one silently, which is
    // exactly what d10 exists to prevent now that there is data entry.
    const b = postingJournal(posting(), "1900", "CAD");
    expect(b.suspense).toBeUndefined();
    expect(b.lines.some((l) => l.accountId === "1900")).toBe(false);
  });

  it("throws rather than assembling an unbalanced posting", () => {
    const p = posting({ lines: [line("6400", 1200), line("1010", -900)] });
    expect(() => postingJournal(p, "1900", "CAD")).toThrow(/must balance/);
  });
});

describe("M-08 d19 — an accrual is two ordinary postings, and nothing prevents one", () => {
  it("posts an estimate and reverses it by hand, with no new concept", () => {
    // d19 declines the MACHINERY — a posting marked to auto-reverse on a future
    // date — and not the act: "it is two postings this flow already supports,
    // and no new concept is needed to do it correctly."
    const estimate = {
      businessDate: "2026-09-30",
      lines: [line("6410", 400, { memo: "Hydro estimate" }), line("1010", -400)],
    };
    const reversal = {
      businessDate: "2026-10-01",
      lines: [line("6410", -400, { memo: "Reverse hydro estimate" }), line("1010", 400)],
    };

    expect(postingRefusal(estimate, ctx())).toBeUndefined();
    expect(postingRefusal(reversal, ctx())).toBeUndefined();

    // The pair nets to nothing, which is what makes it a reversal.
    const net = postingBalance([...estimate.lines, ...reversal.lines]);
    expect(net.debits).toBe(net.credits);
  });
});
