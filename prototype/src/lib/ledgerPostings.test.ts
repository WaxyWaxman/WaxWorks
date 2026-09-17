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
  TYPEABLE_BY_EXCEPTION,
  untypeableReason,
  type LedgerPosting,
  type PostingContext,
  type TypedPostingLine,
} from "./ledgerPostings";
import { buildChart } from "./chart";
import { SECTIONS, TENDERS, TAX_TYPES } from "../data/seed";

const acct = (id: string, name: string, role?: GLRole, active = true): GLAccount => ({
  id,
  name,
  number: id,
  active,
  ...(role ? { role } : { type: "expense" as const }),
});

const ACCOUNTS: GLAccount[] = [
  acct("1010", "Chequing", "bank"),
  acct("1100", "Undeposited funds", "undeposited"),
  acct("1200", "Inventory", "inventory"),
  acct("1300", "GST paid", "tax-paid"),
  acct("1900", "Suspense", "suspense"),
  acct("2100", "Accounts payable", "accounts-payable"),
  acct("2150", "Accounts payable — opening", "accounts-payable-opening"),
  acct("2200", "GST collected", "tax-collected"),
  acct("2300", "Gift cards", "gift-card-liability"),
  acct("2400", "Customer credit", "customer-credit"),
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

  it("refuses Suspense — d14, ratified 2026-09-17", () => {
    // Was marked NOT RATIFIED when it was written, and this test asserted the
    // marking as well as the rule. Ratified after being built and walked, so
    // the marking goes and the rule stays. M-07 d10's "none can clear one" now
    // has an exception, and M-07's Inherited section carries it.
    const why = untypeableReason(acct("1900", "Suspense", "suspense"));
    expect(why).toContain("its own act");
    expect(why).not.toContain("not ratified");
  });

  it("refuses the gift card liability — M-08 d33", () => {
    // d13's own argument with E-05 in M-05's place: the balance IS the sum of
    // what is outstanding on live cards, so one typed line makes the books
    // disagree with the cards a customer physically presents.
    const why = untypeableReason(acct("2300", "Gift cards", "gift-card-liability"));
    expect(why).toContain("kept by the system");
    expect(why).toContain("never typed");
  });

  it("still PERMITS the accounts d13 considered and allowed", () => {
    expect(untypeableReason(acct("1200", "Inventory", "inventory"))).toBeUndefined();
    expect(untypeableReason(acct("2150", "A/P — opening", "accounts-payable-opening"))).toBeUndefined();
  });
});

describe("M-08 d32, d34 — the test behind d13, and the case it turned around", () => {
  it("PERMITS tax collected and tax paid, because nothing in this system remits tax", () => {
    // d34. They pass d32's first half — the till fills one, the receiving desk
    // fills the other — and fail its second: no flow models remittance, so
    // locking them leaves a shop unable to record paying its own sales tax
    // while the liability grows every quarter forever.
    expect(untypeableReason(acct("2200", "GST collected", "tax-collected"))).toBeUndefined();
    expect(untypeableReason(acct("1300", "GST paid", "tax-paid"))).toBeUndefined();
  });

  it("names every deliberate permission rather than leaving it an absence", () => {
    // An absence cannot be read and cannot be tested. A later reader tightening
    // the switch would otherwise have to rediscover why Inventory is offered.
    expect(Object.keys(TYPEABLE_BY_EXCEPTION).sort()).toEqual([
      "inventory",
      "tax-collected",
      "tax-paid",
    ]);
    expect(TYPEABLE_BY_EXCEPTION["inventory"]).toContain("d13");
    expect(TYPEABLE_BY_EXCEPTION["tax-collected"]).toContain("d34");
  });

  it("lets a Manager post the remittance d34 leaves to hand, as two ordinary lines", () => {
    // d19's shape: an act nobody has modelled is not thereby forbidden.
    // Debit the liability, credit the bank, and the quarter discharges.
    const remittance = {
      businessDate: "2026-09-15",
      lines: [
        line("2200", 4_812.5, { memo: "GST remitted, Q2" }),
        line("1010", -4_812.5, { memo: "GST remitted, Q2" }),
      ],
    };
    expect(postingRefusal(remittance, ctx())).toBeUndefined();
  });

  it("M-08 d38 — LOCKS the two accounts d32 named, now that they have been examined", () => {
    // d32 stated the test and declined to apply it; d38 applied it. Both pass
    // d32's first half, and both have an act with no route — cash that never
    // reaches the bank (M-03 d8 declined over/short entirely), and a
    // customer-credit balance drifted from the customer ledger. What decided it
    // is d32's other word: a discrepancy is DEFECT-REPAIR, not a recurring act,
    // and d14 already gives defect-repair its own manager-only act.
    //
    // This test asserted the opposite until 2026-09-17, which is correct: it
    // was asserting d32's deliberate non-decision, and the decision has now
    // been taken.
    for (const role of ["customer-credit", "tender-customer-credit"] as const) {
      expect(untypeableReason(acct("2400", "Customer credit", role))).toContain("E-07's balance");
    }
    expect(untypeableReason(acct("1100", "Undeposited funds", "undeposited"))).toContain(
      "filled by the close and emptied by a deposit",
    );
  });

  it("M-08 d38, d14 — every locked account routes its correction to the same shape", () => {
    // d14 and d38 — three accounts now want an act that is designed NOWHERE.
    // Recorded as an open question; asserted here so the day it is built, this
    // is the list it has to serve.
    for (const role of ["suspense", "customer-credit", "undeposited"] as const) {
      expect(untypeableReason(acct("x", "Account", role))).toContain("own act");
    }
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

// ---------------------------------------------------------------------------
// Against the REAL chart, not a hand-built fixture
// ---------------------------------------------------------------------------

describe("M-08 d13, d33 — the locks hold against the chart the shop actually gets", () => {
  // Every fixture above is hand-built and carries the RESERVED roles only.
  // buildChart also emits M-07 d21's per-tender accounts, which SHADOW the
  // reserved ones — 2210 "Gift card liability — Gift card" sits under the
  // reserved 2200, and it is the one a redemption posts to. A lock on the
  // reserved role alone left a door beside a locked door, and no hand-built
  // fixture could see it: the tender accounts only exist once the real chart
  // is built from the real seams. Found by opening the screen.
  const chart = buildChart({ sections: SECTIONS, tenders: TENDERS, taxTypes: TAX_TYPES });

  it("emits both the reserved account and its tender shadow", () => {
    expect(chart.accounts.some((a) => a.role === "gift-card-liability")).toBe(true);
    expect(chart.accounts.some((a) => a.role === "tender-gift-card")).toBe(true);
    expect(chart.accounts.some((a) => a.role === "customer-credit")).toBe(true);
    expect(chart.accounts.some((a) => a.role === "tender-customer-credit")).toBe(true);
  });

  it("refuses the gift card liability at BOTH accounts (d33)", () => {
    for (const a of chart.accounts.filter(
      (x) => x.role === "gift-card-liability" || x.role === "tender-gift-card",
    )) {
      expect(untypeableReason(a)).toBeDefined();
    }
  });

  it("offers no gift card or retained-earnings account anywhere in the picker", () => {
    const offered = offerableAccounts(chart.accounts);
    expect(offered.some((a) => a.role === "gift-card-liability")).toBe(false);
    expect(offered.some((a) => a.role === "tender-gift-card")).toBe(false);
    expect(offered.some((a) => a.role === "retained-earnings")).toBe(false);
    expect(offered.some((a) => a.role === "accounts-payable")).toBe(false);
    expect(offered.some((a) => a.role === "suspense")).toBe(false);
  });

  it("still offers what d13 and d34 deliberately permit", () => {
    const offered = offerableAccounts(chart.accounts);
    expect(offered.some((a) => a.role === "inventory")).toBe(true);
    expect(offered.some((a) => a.role === "accounts-payable-opening")).toBe(true);
    expect(offered.some((a) => a.role === "tax-collected")).toBe(true);
  });
});
