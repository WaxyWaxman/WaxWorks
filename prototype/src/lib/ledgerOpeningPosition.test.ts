import { describe, expect, it } from "vitest";
import type { GLAccount, GLAccountType, GLRole, LedgerPeriodSeal } from "../data/types";
import {
  dayBefore,
  draftLines,
  equityReadBack,
  firstDayRefusal,
  openableAccounts,
  openingBalance,
  openingDateOf,
  openingRefusal,
  openingSealRefusal,
  openingUnsealRefusal,
  sealOpeningPosition,
  untypeableInOpeningReason,
  type OpeningContext,
  type OpeningPositionDraft,
} from "./ledgerOpeningPosition";

const acct = (
  id: string,
  name: string,
  role?: GLRole,
  type?: GLAccountType,
  active = true,
): GLAccount => ({ id, name, number: id, active, ...(role ? { role } : {}), ...(type ? { type } : {}) });

const ACCOUNTS: GLAccount[] = [
  acct("1010", "Chequing", "bank"),
  acct("1200", "Inventory", "inventory"),
  acct("1900", "Suspense", "suspense"),
  acct("2100", "Accounts payable", "accounts-payable"),
  acct("2150", "Accounts payable — opening", "accounts-payable-opening"),
  acct("2400", "Customer credit", "customer-credit"),
  acct("2500", "Bank loan", undefined, "liability"),
  acct("3000", "Owner's equity", "owners-equity"),
  acct("3200", "Retained earnings", "retained-earnings"),
  acct("4000", "Interest income", undefined, "income"),
  acct("6400", "Rent", undefined, "expense"),
  acct("1500", "Old prepaid", undefined, "asset", false),
];

const TODAY = "2026-09-17";

const ctx = (over: Partial<OpeningContext> = {}): OpeningContext => ({
  accounts: ACCOUNTS,
  seals: [],
  unseals: [],
  today: TODAY,
  ...over,
});

const seal = (id: string, period: string): LedgerPeriodSeal => ({
  id,
  period,
  sealedAt: `${period}-28 17:00:00`,
  actorInitials: "WW",
  authorizedByInitials: "WW",
  suspenseGross: 0,
});

/** Assets 61,200 + 18,000 = 79,200. Liabilities 11,300 + 20,000 = 31,300. Equity 47,900. */
const draft = (over: Partial<OpeningPositionDraft> = {}): OpeningPositionDraft => ({
  firstDay: "2026-06-01",
  inventory: 61_200,
  typed: { "1010": 18_000, "2150": 11_300, "2500": 20_000 },
  ...over,
});

describe("M-08 step 2 — the opening position is dated the day before the books start", () => {
  it("steps back one day, across a month and a year boundary", () => {
    expect(dayBefore("2026-06-01")).toBe("2026-05-31");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
    expect(dayBefore("2028-03-01")).toBe("2028-02-29");
  });

  it("dates the position itself the day before", () => {
    expect(openingDateOf(draft())).toBe("2026-05-31");
  });
});

describe("M-08 step 1 — the first day, and both refusals are GUESSES", () => {
  it("refuses a day that is not the first of a month — a guess, unconfirmed", () => {
    // Step 1: "Guess: it must be a past date and the first day of a month;
    // unconfirmed." Implemented so it can be looked at, not because it is
    // settled.
    const why = firstDayRefusal("2026-06-15", TODAY);
    expect(why).toContain("first day of a month");
    expect(why).toContain("a guess");
  });

  it("refuses a future day — also a guess", () => {
    const why = firstDayRefusal("2027-01-01", TODAY);
    expect(why).toContain("past date");
    expect(why).toContain("a guess");
  });

  it("accepts the first of a past month", () => {
    expect(firstDayRefusal("2026-06-01", TODAY)).toBeUndefined();
  });
});

describe("M-08 d7, d8, d9, d26 — what may not be typed, and why each is different", () => {
  it("refuses Accounts payable and names the opening account instead (d7)", () => {
    // d7's mechanism: the lump goes somewhere else so that *the Accounts
    // payable balance IS M-05's balance* is checkable on day one and forever.
    const why = untypeableInOpeningReason(acct("2100", "Accounts payable", "accounts-payable"));
    expect(why).toContain("M-05's balance");
    expect(why).toContain("opening account");
  });

  it("PERMITS Accounts payable — opening, which is the whole of d7's mechanism", () => {
    expect(
      untypeableInOpeningReason(acct("2150", "A/P — opening", "accounts-payable-opening")),
    ).toBeUndefined();
  });

  it("refuses the customer side, which opens empty (d8)", () => {
    const why = untypeableInOpeningReason(acct("2400", "Customer credit", "customer-credit"));
    expect(why).toContain("opens empty");
    expect(why).toContain("never migrated");
  });

  it("refuses revenue and expense — the balance sheet only (d9)", () => {
    expect(untypeableInOpeningReason(acct("4000", "Interest income", undefined, "income"))).toContain(
      "no revenue or expense",
    );
    expect(untypeableInOpeningReason(acct("6400", "Rent", undefined, "expense"))).toContain(
      "no revenue or expense",
    );
  });

  it("refuses equity, because it is the figure that balances (d26)", () => {
    expect(untypeableInOpeningReason(acct("3000", "Owner's equity", "owners-equity"))).toContain(
      "figure that balances",
    );
    expect(untypeableInOpeningReason(acct("3200", "Retained earnings", "retained-earnings"))).toContain(
      "figure that balances",
    );
  });

  it("refuses Inventory because it is SUPPLIED, not because it is forbidden (step 3)", () => {
    // The distinction matters: d13 permits typing into Inventory in an ordinary
    // posting (a dead-stock write-down). Here it is simply not the Manager's to
    // type, because the system already knows it.
    const why = untypeableInOpeningReason(acct("1200", "Inventory", "inventory"));
    expect(why).toContain("supplied by the system");
    expect(why).toContain("on hand × cost");
  });

  it("refuses Suspense — INFERRED from M-07 d10, not from d14", () => {
    // d14 refuses Suspense in an ORDINARY posting and says nothing about the
    // opening position, which is not one. M-07 d10 is what refuses it here:
    // a Suspense balance is "a defect in this system, never a data-entry
    // error", and the accountant's statements have no such account to copy.
    const why = untypeableInOpeningReason(acct("1900", "Suspense", "suspense"));
    expect(why).toContain("this system's own");
    expect(why).toContain("M-07 d10");
  });

  it("offers only what a Manager types off the accountant's statements", () => {
    // Bank, the paper-era payables lump, and a loan. Nothing else: inventory is
    // supplied, equity is derived, revenue and expense are out, the customer
    // side opens empty, A/P is M-05's, and Suspense has no paper figure.
    const offered = openableAccounts(ACCOUNTS).map((a) => a.id);
    expect(offered).toEqual(["1010", "2150", "2500"]);
  });

  it("refuses the draft itself, not only the form", () => {
    const d = draft({ typed: { "2100": 11_300 } });
    expect(openingRefusal(d, ctx())).toContain("M-05's balance");
  });
});

describe("M-08 d26 — equity is the figure that balances, and cannot fail to", () => {
  it("derives equity as assets less liabilities", () => {
    const b = openingBalance(draft(), ACCOUNTS);
    expect(b.assets).toBe(79_200);
    expect(b.liabilities).toBe(31_300);
    expect(b.equity).toBe(47_900);
  });

  it("takes the side from the account's TYPE, never from its number (M-07 d22, d3)", () => {
    // The Manager types magnitudes. A liability credits because it is a
    // liability, not because of anything about 2500.
    const b = openingBalance(draft({ typed: { "1010": 1000, "2500": 400 } }), ACCOUNTS);
    expect(b.assets).toBe(62_200);
    expect(b.liabilities).toBe(400);
  });

  it("lets a negative figure mean the other side — an overdrawn bank account", () => {
    const b = openingBalance(draft({ inventory: 0, typed: { "1010": -500 } }), ACCOUNTS);
    expect(b.assets).toBe(0);
    expect(b.liabilities).toBe(500);
    expect(b.equity).toBe(-500);
  });

  it("puts a counted-inventory disagreement straight into equity, with nothing to write", () => {
    // Step 3: "Where it disagrees with the accountant's figure, the counted
    // figure wins and the difference falls into equity." It falls out of d26
    // rather than being a rule: equity is whatever is left over.
    const counted = openingBalance(draft({ inventory: 61_200 }), ACCOUNTS).equity;
    const accountants = openingBalance(draft({ inventory: 60_000 }), ACCOUNTS).equity;
    expect(counted - accountants).toBe(1_200);
  });

  it("cannot fail to balance — the seal never refuses on arithmetic", () => {
    // d26's whole purpose. The only thing the seal waits for is d28's
    // acknowledgement.
    const d = draft({ accountantsEquity: 47_900 });
    expect(openingSealRefusal(d, ctx())).toBeUndefined();
  });
});

describe("M-08 d28 — the read-back, the only mechanical detector there is", () => {
  it("agrees when the accountant's figure matches", () => {
    const r = equityReadBack(draft({ accountantsEquity: 47_900 }), ACCOUNTS);
    expect(r.derived).toBe(47_900);
    expect(r.agrees).toBe(true);
    expect(r.difference).toBe(0);
  });

  it("catches the typo d26 named, which nothing else could ever detect", () => {
    // "Type inventory as $612,000 instead of $61,200 and the books balance
    // perfectly around half a million dollars of invented worth."
    const fat = draft({ inventory: 612_000, accountantsEquity: 47_900 });
    const r = equityReadBack(fat, ACCOUNTS);
    expect(r.derived).toBe(598_700);
    expect(r.agrees).toBe(false);
    expect(r.difference).toBe(550_800);
  });

  it("refuses the seal until the difference is acknowledged, naming both figures", () => {
    const fat = draft({ inventory: 612_000, accountantsEquity: 47_900 });
    const why = openingSealRefusal(fat, ctx());
    expect(why).toContain("598700.00");
    expect(why).toContain("47900.00");
    expect(why).toContain("Acknowledge");
  });

  it("ACKNOWLEDGES rather than refuses — the paper sometimes does not balance", () => {
    // A-28a's house preference. "A Manager who can explain the difference must
    // be able to proceed."
    const fat = draft({ inventory: 612_000, accountantsEquity: 47_900, differenceAcknowledged: true });
    expect(openingSealRefusal(fat, ctx())).toBeUndefined();
  });

  it("refuses the seal while no accountant's figure has been typed at all", () => {
    expect(openingSealRefusal(draft(), ctx())).toContain("before sealing");
  });

  it("discards the typed figure and records only the acknowledgement", () => {
    // d28: "the figure they typed is discarded, so the acknowledgement is the
    // only record that the check ever ran — which argues for it being recorded
    // with the seal rather than being a dialog that closes."
    const fat = draft({ inventory: 612_000, accountantsEquity: 47_900, differenceAcknowledged: true });
    const sealed = sealOpeningPosition(fat, ACCOUNTS, "3000", "1900", "2026-06-01 09:00:00");

    expect(sealed.acknowledgedDifference).toBe(550_800);
    const asJson = JSON.stringify(sealed);
    expect(asJson).not.toContain("accountantsEquity");
    expect(asJson).not.toContain("47900");
  });

  it("records nothing where the figures agreed", () => {
    const sealed = sealOpeningPosition(
      draft({ accountantsEquity: 47_900 }),
      ACCOUNTS,
      "3000",
      "1900",
      "2026-06-01 09:00:00",
    );
    expect(sealed.acknowledgedDifference).toBeUndefined();
  });
});

describe("M-08 A-78 — equity is derived while draft and materialised at seal", () => {
  it("holds NO equity line while it is a draft, and therefore does not balance", () => {
    // A-78: "the draft is the one place in the ledger where an unbalanced set
    // of figures legitimately exists — so nothing may read a draft opening
    // position as though it were a journal." This returns postings, not a
    // JournalBatch, for exactly that reason.
    const lines = draftLines(draft(), ACCOUNTS);
    expect(lines.some((l) => l.accountId === "3000")).toBe(false);
    const net = lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
    expect(net).not.toBe(0);
    expect(net).toBe(47_900_00);
  });

  it("writes the equity line at the seal, and the batch balances", () => {
    const sealed = sealOpeningPosition(
      draft({ accountantsEquity: 47_900 }),
      ACCOUNTS,
      "3000",
      "1900",
      "2026-06-01 09:00:00",
    );
    const equity = sealed.batch.lines.find((l) => l.accountId === "3000");
    expect(equity?.credit).toBe(47_900);

    const debits = sealed.batch.lines.reduce((s, l) => s + Math.round(l.debit * 100), 0);
    const credits = sealed.batch.lines.reduce((s, l) => s + Math.round(l.credit * 100), 0);
    expect(debits).toBe(credits);
  });

  it("needs no Suspense, because d26 removed the only place it could have", () => {
    const sealed = sealOpeningPosition(
      draft({ accountantsEquity: 47_900 }),
      ACCOUNTS,
      "3000",
      "1900",
      "2026-06-01 09:00:00",
    );
    expect(sealed.batch.suspense).toBeUndefined();
    expect(sealed.batch.lines.some((l) => l.accountId === "1900")).toBe(false);
  });

  it("dates every line the day before the books start, and names its artifact", () => {
    const sealed = sealOpeningPosition(
      draft({ accountantsEquity: 47_900 }),
      ACCOUNTS,
      "3000",
      "1900",
      "2026-06-01 09:00:00",
    );
    expect(sealed.batch.source).toBe("opening-position:2026-06-01");
    for (const l of sealed.batch.lines) expect(l.businessDate).toBe("2026-05-31");
  });

  it("writes the paper-era lump to the opening account and nothing to Accounts payable", () => {
    // d7's invariant, visible in the journal: A/P starts at exactly zero, so it
    // equals M-05's balance on day one.
    const sealed = sealOpeningPosition(
      draft({ accountantsEquity: 47_900 }),
      ACCOUNTS,
      "3000",
      "1900",
      "2026-06-01 09:00:00",
    );
    expect(sealed.batch.lines.find((l) => l.accountId === "2150")?.credit).toBe(11_300);
    expect(sealed.batch.lines.some((l) => l.accountId === "2100")).toBe(false);
  });

  it("writes no line for a zero figure", () => {
    const sealed = sealOpeningPosition(
      draft({ typed: { "1010": 18_000, "2150": 0, "2500": 20_000 }, accountantsEquity: 59_200 }),
      ACCOUNTS,
      "3000",
      "1900",
      "2026-06-01 09:00:00",
    );
    expect(sealed.batch.lines.some((l) => l.accountId === "2150")).toBe(false);
  });
});

describe("M-08 d6 — retypeable until the first real seal, and never after", () => {
  it("permits the unseal while no period has been sealed", () => {
    expect(openingUnsealRefusal([], [])).toBeUndefined();
  });

  it("refuses it once any period is sealed, and names the forward route", () => {
    // "A shop that seals its first month and then finds its opening bank figure
    // wrong carries a visible correcting posting in month two rather than a
    // clean opening position."
    const why = openingUnsealRefusal([seal("s1", "2026-06")], []);
    expect(why).toContain("2026-06 has been sealed");
    expect(why).toContain("dated posting");
  });

  it("permits it again if that period is unsealed — the window tracks the state", () => {
    const seals = [seal("s1", "2026-06")];
    const unseals = [
      {
        id: "u1",
        sealId: "s1",
        unsealedAt: "2026-07-02 10:00:00",
        actorInitials: "WW",
        authorizedByInitials: "WW",
        reason: "Opening bank figure wrong",
      },
    ];
    expect(openingUnsealRefusal(seals, unseals)).toBeUndefined();
  });
});

describe("M-08 d9 — the first fiscal year is a stub", () => {
  it("carries the balance sheet and nothing else, so the P&L starts at the switchover", () => {
    const sealed = sealOpeningPosition(
      draft({ accountantsEquity: 47_900 }),
      ACCOUNTS,
      "3000",
      "1900",
      "2026-06-01 09:00:00",
    );
    // No income, cogs or expense account appears anywhere in the batch.
    const pAndL = new Set(["4000", "6400"]);
    expect(sealed.batch.lines.some((l) => pAndL.has(l.accountId))).toBe(false);
  });
});
