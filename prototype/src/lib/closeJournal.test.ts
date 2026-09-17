import { describe, expect, it } from "vitest";
import { buildCloseJournal, businessDateOf, tenderIsAmbiguous, tenderRowFor, type CloseJournalInput } from "./closeJournal";
import { buildChart } from "./chart";
import { batchTotals, datesIn, isImbalanced } from "./journal";
import type {
  Genre,
  InventoryItem,
  JournalBatch,
  RecordEntry,
  Sale,
  SaleLine,
  SectionRow,
  TaxType,
  Tender,
  TenderRow,
} from "../data/types";

// --- the seams, small enough to hold in your head ---------------------------

const section = (code: string, name: string, countsAsRevenue = true): SectionRow =>
  ({ code, name, countsAsRevenue, tracksStockDefault: true, discountable: true, returnable: true, active: true }) as SectionRow;

const SECTIONS = [section("VI", "VINYL"), section("GC", "GIFT CARDS", false)];

const GENRES: Genre[] = [
  { id: "gn-rock", name: "Rock", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-gc", name: "Gift cards", section: "GC", productTaxCode: "0", active: true },
] as Genre[];

const TENDERS: TenderRow[] = [
  { id: "tn-cash", name: "Cash", behavior: "Cash", active: true },
  { id: "tn-visa", name: "Visa", behavior: "Credit Card", active: true },
  { id: "tn-mc", name: "Mastercard", behavior: "Credit Card", active: true },
  { id: "tn-gift", name: "Gift card", behavior: "Gift Card", active: true },
  { id: "tn-payout", name: "Pay-out", behavior: "Pay-out", active: true },
  { id: "tn-round", name: "Cash rounding", behavior: "Cash", active: true, systemOwned: true },
];

const TAX_TYPES: TaxType[] = [{ code: "a", name: "GST", ratePpm: 50_000 }] as TaxType[];

const RECORDS: RecordEntry[] = [{ id: "r-1", artist: "A", title: "T", genreId: "gn-rock" }] as RecordEntry[];

const INVENTORY: InventoryItem[] = [
  { id: "i-1", recordId: "r-1", grade: "NM", price: 20, cost: 8, status: "sold" },
  { id: "i-2", recordId: "r-1", grade: "NM", price: 20, cost: 8, status: "sold" },
] as InventoryItem[];

const CHART = buildChart({ sections: SECTIONS, tenders: TENDERS, taxTypes: TAX_TYPES });

const line = (over: Partial<SaleLine>): SaleLine =>
  ({
    id: "l-1",
    kind: "item",
    recordId: "r-1",
    inventoryItemId: "i-1",
    title: "A — T",
    qty: 1,
    price: 20,
    discountPct: 0,
    productTaxCode: "1",
    tax: [{ code: "a", name: "GST", ratePpm: 50_000, amount: 1 }],
    ...over,
  }) as SaleLine;

const tender = (over: Partial<Tender>): Tender => ({ id: "t-1", type: "Cash", amount: 21, ...over }) as Tender;

const sale = (over: Partial<Sale>): Sale =>
  ({
    id: "s-1",
    state: "Current",
    saleNumber: 1,
    createdBy: "Y",
    createdAt: "2026-09-15 10:00:00",
    tenderedAt: "2026-09-15 10:00:00",
    lines: [line({})],
    tenders: [tender({})],
    log: [],
    ...over,
  }) as Sale;

const build = (sales: Sale[], over: Partial<CloseJournalInput> = {}) =>
  buildCloseJournal({
    batchId: "batch-1",
    writtenAt: "2026-09-16 18:00:00",
    sales,
    records: RECORDS,
    inventory: INVENTORY,
    genres: GENRES,
    sections: SECTIONS,
    tenders: TENDERS,
    taxCtx: { types: TAX_TYPES, cells: [], groupId: "g", at: "2026-09-15 10:00:00" },
    accounts: CHART.accounts,
    mappings: CHART.mappings,
    currency: "CAD",
    ...over,
  });

const acct = (number: string) => CHART.accounts.find((a) => a.number === number)!.id;
const lineFor = (b: JournalBatch, accountId: string, date?: string) =>
  b.lines.find((l) => l.accountId === accountId && (!date || l.businessDate === date));

// ---------------------------------------------------------------------------

describe("M-07 d9 — the close's lines come from figures the close already has", () => {
  it("credits the Section's revenue account, net of tax (d6)", () => {
    const { batch } = build([sale({})]);
    // 4100 is VINYL's suggested number. The account is found by NUMBER only
    // here, in the test — d3 forbids the software from resolving that way, and
    // buildChart is what puts the number on it.
    expect(lineFor(batch, acct("4100"))?.credit).toBe(20);
  });

  it("credits tax collected per type, and never the paid half (d5)", () => {
    const { batch } = build([sale({})]);
    expect(lineFor(batch, acct("2400"))?.credit).toBe(1);
    // The ITC account exists and stays untouched: inbound tax arrives on a
    // supplier Invoice (E-02 d34), never at the till.
    expect(lineFor(batch, acct("1300"))).toBeUndefined();
  });

  it("moves the copy's own cost from Inventory to cost of goods (d2 — perpetual)", () => {
    const { batch } = build([sale({})]);
    expect(lineFor(batch, acct("5100"))?.debit).toBe(8);
    expect(lineFor(batch, acct("1200"))?.credit).toBe(8);
  });

  it("debits the account the tender's behavior implies (d21)", () => {
    const { batch } = build([sale({})]);
    // Cash — undeposited funds, 1100. Not a revenue account and not the bank:
    // A-65 holds no balance for a bank and a close does not reach one.
    expect(lineFor(batch, acct("1100"))?.debit).toBe(21);
  });

  it("balances without touching Suspense", () => {
    const { batch } = build([sale({})]);
    expect(isImbalanced(batch)).toBe(false);
    const { debit, credit } = batchTotals(batch);
    expect(debit).toBe(credit);
  });
});

describe("M-07 d14 — one batch, dated per business day", () => {
  it("dates each Sale's lines by its own tender, not by when the close ran", () => {
    // M-03 step 2 closes ALL Current Sales. A close nobody ran on Monday
    // sweeps Monday and Tuesday, and a single entry dated at close files a
    // short September and a long October with nothing downstream able to tell.
    const monday = sale({ id: "s-mon", saleNumber: 1, tenderedAt: "2026-09-14 19:00:00" });
    const tuesday = sale({
      id: "s-tue",
      saleNumber: 2,
      tenderedAt: "2026-09-15 11:00:00",
      lines: [line({ id: "l-2", inventoryItemId: "i-2" })],
    });

    const { batch } = build([monday, tuesday]);

    expect(batch.writtenAt.slice(0, 10)).toBe("2026-09-16");
    expect(datesIn(batch)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(lineFor(batch, acct("4100"), "2026-09-14")?.credit).toBe(20);
    expect(lineFor(batch, acct("4100"), "2026-09-15")?.credit).toBe(20);
  });

  it("nets a Sale and its Return on the same day into one line per account", () => {
    const sold = sale({ id: "s-a", saleNumber: 1 });
    const back = sale({
      id: "s-b",
      saleNumber: 2,
      lines: [line({ id: "l-r", qty: -1, tax: [{ code: "a", name: "GST", ratePpm: 50_000, amount: -1 }], routedTo: "sellable" })],
      tenders: [tender({ id: "t-r", amount: -21 })],
    });

    const { batch } = build([sold, back]);

    // Sold and returned the same day: nothing moved, and the file says so by
    // carrying no row at all rather than a pair that cancel.
    expect(batch.lines).toEqual([]);
  });

  it("falls back to the tender log entry for a Sale seeded before tenderedAt existed", () => {
    const old = sale({ tenderedAt: undefined, log: [{ at: "2026-08-21 16:40:00", text: "Tendered — Sale number 100241 assigned" }] });
    expect(businessDateOf(old)).toBe("2026-08-21");
  });
});

describe("M-06 d20 — a gift card load is a liability, never a revenue bucket", () => {
  it("credits the gift card liability and no Section", () => {
    const load = sale({
      lines: [line({ id: "l-gc", kind: "giftcard-load", recordId: undefined, inventoryItemId: undefined, genreId: "gn-gc", qty: 1, price: 25, tax: [] })],
      tenders: [tender({ amount: 25 })],
    });

    const { batch } = build([load]);

    expect(lineFor(batch, acct("2200"))?.credit).toBe(25);
    expect(lineFor(batch, acct("4110"))).toBeUndefined(); // the GIFT CARDS Section's own account
    expect(isImbalanced(batch)).toBe(false);
  });
});

describe("M-07 d2 — a Return only reverses the cost where the copy came back", () => {
  it("puts the cost back into Inventory when the copy is routed to sellable", () => {
    const back = sale({
      lines: [line({ qty: -1, tax: [{ code: "a", name: "GST", ratePpm: 50_000, amount: -1 }], routedTo: "sellable" })],
      tenders: [tender({ amount: -21 })],
    });

    const { batch } = build([back]);

    expect(lineFor(batch, acct("1200"))?.debit).toBe(8);
    expect(lineFor(batch, acct("5100"))?.credit).toBe(8);
  });

  it("reverses it for a written-off copy too, because the write-off is its own act", () => {
    // The copy came back over the counter either way. Routing it to `writeoff`
    // is an on-hand adjustment, and d12 has an adjustment write its OWN journal
    // to the account its reason code maps to (d6) — so the cost comes back into
    // Inventory here and leaves again there. Two decided movements rather than
    // one invented one, and the write-off lands in the account d6 created for
    // it instead of sitting silently in cost of goods.
    const back = sale({
      lines: [line({ qty: -1, tax: [{ code: "a", name: "GST", ratePpm: 50_000, amount: -1 }], routedTo: "writeoff" })],
      tenders: [tender({ amount: -21 })],
    });

    const { batch } = build([back]);

    expect(lineFor(batch, acct("1200"))?.debit).toBe(8);
    expect(lineFor(batch, acct("5100"))?.credit).toBe(8);
    expect(isImbalanced(batch)).toBe(false);
  });

  it("reverses it for a return nobody has routed yet", () => {
    // The reversal is a fact about the copy coming back, not about what is
    // done with it afterwards — so it does not wait on a disposition.
    const back = sale({
      lines: [line({ qty: -1, tax: [{ code: "a", name: "GST", ratePpm: 50_000, amount: -1 }], routedTo: undefined })],
      tenders: [tender({ amount: -21 })],
    });

    const { batch } = build([back]);

    expect(lineFor(batch, acct("1200"))?.debit).toBe(8);
    expect(isImbalanced(batch)).toBe(false);
  });
});

describe("M-07 d10 — an unresolvable seam reaches Suspense and is named", () => {
  it("posts the difference and reports what it could not resolve", () => {
    // A Section with no mapping is what d11 exists to prevent. Forced here by
    // handing the journal a chart that predates the Section — which is exactly
    // M-06 d58's "adding a Section creates and maps its account in the same
    // act" failing to happen.
    const stale = buildChart({ sections: [section("VI", "VINYL")], tenders: TENDERS, taxTypes: TAX_TYPES });
    const withNewSection = [...SECTIONS, section("ME", "MERCH")];
    const merchGenre: Genre = { id: "gn-merch", name: "Merch", section: "ME", productTaxCode: "1", active: true } as Genre;

    const { batch, unresolved } = build([sale({ lines: [line({ genreId: "gn-merch", kind: "nontracked", recordId: undefined, inventoryItemId: undefined })] })], {
      sections: withNewSection,
      genres: [...GENRES, merchGenre],
      accounts: stale.accounts,
      mappings: stale.mappings,
    });

    expect(unresolved).toContain("Section MERCH");
    expect(isImbalanced(batch)).toBe(true);
    const { debit, credit } = batchTotals(batch);
    expect(debit).toBe(credit); // d10 — balanced BY CONSTRUCTION, always writable
  });
});

describe("what a Sale does not record", () => {
  it("posts to the tender the Sale names, not to whichever shares its behaviour (E-05 d36)", () => {
    // The reconciliation M-06 d22 gives Visa and Mastercard separate accounts
    // FOR. Before d36 the pad offered behaviours, so every card in the day
    // landed in whichever row was listed first.
    const mc = tender({ type: "Credit Card", tenderRowId: "tn-mc", amount: 21 });
    expect(tenderRowFor(mc, TENDERS)?.id).toBe("tn-mc");
    expect(tenderIsAmbiguous(mc, TENDERS)).toBe(false);

    const { batch, ambiguousTenders } = build([sale({ tenders: [mc] })]);
    expect(lineFor(batch, acct("1120"))?.debit).toBe(21); // Mastercard's own
    expect(lineFor(batch, acct("1110"))).toBeUndefined(); // not Visa's
    expect(ambiguousTenders).toEqual([]);
  });

  it("still falls back to the behaviour for a Sale recorded before the pad offered rows", () => {
    // M-06 d22 gives them separate accounts BECAUSE they settle as separate
    // deposits. `Tender.type` is `Credit Card` for both, so the reconciliation
    // that reason exists to protect is not reachable from a Sale.
    const t = tender({ type: "Credit Card", amount: 21 });
    expect(tenderIsAmbiguous(t, TENDERS)).toBe(true);
    expect(tenderRowFor(t, TENDERS)?.id).toBe("tn-visa");

    const { ambiguousTenders } = build([sale({ tenders: [t] })]);
    expect(ambiguousTenders).toEqual(["Credit Card"]);
  });

  it("never falls onto the system-owned rounding tender when matching a behavior", () => {
    // M-06 d26's rounding tender is a `Cash` tender carrying `systemOwned`, so
    // a plain behavior match would put a customer's cash into Cash over / short
    // on any chart that listed it first.
    const rows: TenderRow[] = [{ id: "tn-round", name: "Cash rounding", behavior: "Cash", active: true, systemOwned: true }, { id: "tn-cash", name: "Cash", behavior: "Cash", active: true }];
    expect(tenderRowFor(tender({ type: "Cash" }), rows)?.id).toBe("tn-cash");
    // And it is still reachable by name, which is the only unambiguous route.
    expect(tenderRowFor(tender({ type: "Cash", tenderRowId: "tn-round" }), rows)?.id).toBe("tn-round");
  });

  it("resolves through a DEACTIVATED tender rather than refusing (d18)", () => {
    // *Active* governs what is offered for new work and never what resolves.
    const rows: TenderRow[] = [{ id: "tn-cash", name: "Cash", behavior: "Cash", active: false }];
    expect(tenderRowFor(tender({ type: "Cash" }), rows)?.id).toBe("tn-cash");
  });

  it("posts a pay-out as the two-sided entry it is (E-05 d35)", () => {
    // Was the worst thing in this file. d16 makes a pay-out cash REMOVED from
    // the till; the till used to store it as a negative tender that left the
    // Sale owing, so the operator cleared it with an offsetting cash tender —
    // and the Sale then recorded $20 of cash that never entered the drawer.
    // The journal balanced exactly and put both accounts on the wrong side by
    // twice the pay-out.
    //
    // d35 makes the pay-out fund itself, so it needs no offsetting tender and
    // the entry is plain: debit the expense, credit the cash it came out of.
    const payoutSale = sale({
      lines: [],
      tenders: [tender({ id: "t-po", type: "Pay-out", amount: -20, note: "courier COD" })],
    });

    const { batch } = build([payoutSale]);

    expect(lineFor(batch, acct("6300"))?.debit).toBe(20); // the expense
    expect(lineFor(batch, acct("1100"))?.credit).toBe(20); // out of the drawer
    expect(isImbalanced(batch)).toBe(false);
    expect(lineFor(batch, acct("6300"))?.memo).toContain("courier COD");
  });

  it("nets the drawer correctly when a pay-out rides on a real Sale", () => {
    // The case the old shape got wrong by $40. The customer hands over $36.20
    // and the courier takes $20 out of the same drawer, so Cash nets $16.20 —
    // and it is ONE line per (date, account), because d14 groups them.
    const mixed = sale({
      tenders: [
        tender({ id: "t-c", type: "Cash", amount: 21 }),
        tender({ id: "t-po", type: "Pay-out", amount: -8, note: "window cleaner" }),
      ],
    });

    const { batch } = build([mixed]);

    expect(lineFor(batch, acct("1100"))?.debit).toBe(13); // 21 in, 8 out
    expect(lineFor(batch, acct("6300"))?.debit).toBe(8);
    expect(isImbalanced(batch)).toBe(false);
  });

  it("says so when there is no Cash tender for a pay-out to come out of", () => {
    // d11 maps every seam, so this is a defect rather than a configuration
    // hole — and it is the one thing about a pay-out this still cannot resolve.
    const noCash = TENDERS.filter((r) => r.behavior !== "Cash");
    const payoutSale = sale({ lines: [], tenders: [tender({ id: "t-po", type: "Pay-out", amount: -20 })] });

    const { unresolved } = build([payoutSale], { tenders: noCash });

    expect(unresolved.join(" ")).toContain("Cash tender");
  });
});
