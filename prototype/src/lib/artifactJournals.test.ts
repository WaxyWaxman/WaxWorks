import { describe, expect, it } from "vitest";
import { buildAdjustmentJournal, buildInvoiceJournal, buildPaymentJournal } from "./artifactJournals";
import { buildChart } from "./chart";
import { batchTotals, isImbalanced } from "./journal";
import type { Invoice, InvoiceLine, PaymentBatch, SectionRow, TaxType, TenderRow } from "../data/types";

const SECTIONS = [
  { code: "VI", name: "VINYL", countsAsRevenue: true, tracksStockDefault: true, discountable: true, returnable: true, active: true },
] as SectionRow[];
const TENDERS = [{ id: "tn-cash", name: "Cash", behavior: "Cash", active: true }] as TenderRow[];
const TAX_TYPES = [
  { code: "a", name: "GST", ratePpm: 50_000 },
  { code: "b", name: "QST", ratePpm: 99_750 },
] as TaxType[];

const CHART = buildChart({ sections: SECTIONS, tenders: TENDERS, taxTypes: TAX_TYPES });
const acct = (number: string) => CHART.accounts.find((a) => a.number === number)!.id;

const invLine = (over: Partial<InvoiceLine> = {}): InvoiceLine =>
  ({ id: "il-1", recordId: "r-1", listPrice: 10, discountPct: 0, cost: 10, acceptedPrice: 20, grade: "NM", qty: 3, ...over }) as InvoiceLine;

const invoice = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: "inv-1",
    supplierId: "sup-1",
    invoiceNumber: "8842",
    intakeMode: "New",
    invoiceDate: "2026-09-10",
    receivedDate: "2026-09-12",
    statedSubtotal: 30,
    tax: 0,
    freight: 0,
    misc: 0,
    status: "Finalized",
    lines: [invLine()],
    createdBy: "Y",
    createdAt: "2026-09-12 09:00:00",
    log: [],
    ...over,
  }) as Invoice;

const buildInv = (iv: Invoice, currency = "CAD") =>
  buildInvoiceJournal({ invoice: iv, writtenAt: "2026-09-12 09:30:00", accounts: CHART.accounts, currency });

const lineFor = (b: { lines: { accountId: string; debit: number; credit: number; businessDate: string; currency: string }[] }, accountId: string) =>
  b.lines.find((l) => l.accountId === accountId);

// ---------------------------------------------------------------------------

describe("M-07 d13 — an Invoice writes its journal at finalize", () => {
  it("debits Inventory with the copies' own costs and credits Accounts Payable", () => {
    const { batch, unresolved } = buildInv(invoice());

    expect(lineFor(batch, acct("1200"))?.debit).toBe(30);
    expect(lineFor(batch, acct("2100"))?.credit).toBe(30);
    expect(unresolved).toEqual([]);
    expect(isImbalanced(batch)).toBe(false);
  });

  it("puts freight in Freight inbound and never into a copy's cost (E-02 d16)", () => {
    const { batch } = buildInv(invoice({ freight: 12 }));

    expect(lineFor(batch, acct("5200"))?.debit).toBe(12);
    // The copies are still 30. There is no landed cost, here or anywhere.
    expect(lineFor(batch, acct("1200"))?.debit).toBe(30);
    expect(lineFor(batch, acct("2100"))?.credit).toBe(42);
    expect(isImbalanced(batch)).toBe(false);
  });

  it("dates the lines by the INVOICE date, not by when someone finalized it (d14)", () => {
    const { batch } = buildInv(invoice());
    expect(batch.writtenAt).toBe("2026-09-12 09:30:00");
    expect(batch.lines.every((l) => l.businessDate === "2026-09-10")).toBe(true);
  });

  it("carries the supplier's currency and converts nothing (d17)", () => {
    const { batch } = buildInv(invoice(), "USD");
    expect(batch.lines.every((l) => l.currency === "USD")).toBe(true);
  });

  it("names the artifact behind every line (d15)", () => {
    expect(buildInv(invoice()).batch.source).toBe("invoice:8842");
  });
});

describe("what an Invoice does not record", () => {
  it("cannot split tax per type, so it reports it and lets Suspense carry the difference", () => {
    // d5 — GST and QST are separate registrations remitted to separate
    // authorities, so their credits cannot share a row. E-02 step 6 records ONE
    // tax figure from the paperwork. The split is not derivable, and A-36 puts
    // tax INSIDE what is owed — so dropping it from both sides would balance
    // the journal and understate a liability, which is worse.
    const { batch, unresolved } = buildInv(invoice({ tax: 4.5 }));

    expect(unresolved.join(" ")).toContain("Tax paid 4.5");
    expect(lineFor(batch, acct("2100"))?.credit).toBe(34.5); // the debt is whole
    expect(isImbalanced(batch)).toBe(true);
    expect(batch.suspense).toBe(4.5);
    const { debit, credit } = batchTotals(batch);
    expect(debit).toBe(credit); // d10 — balanced by construction regardless
  });

  it("has no account for invoice-level miscellaneous", () => {
    // A-29 puts misc in cost of goods; d6's seams are Sections, tenders, tax
    // types and reason codes, and misc is none of them. d11's "nothing can be
    // left unmapped" is complete over the seams it enumerates, not over money.
    const { batch, unresolved } = buildInv(invoice({ misc: 7 }));

    expect(unresolved.join(" ")).toContain("Miscellaneous 7");
    expect(batch.suspense).toBe(7);
  });

  it("refuses to treat a non-calendar invoice date as a business date", () => {
    // The new-intake form accepts DD/MM/YYYY and stores it raw — already
    // visible on the screen as a due date of "NaN-NaN-NaN". It costs more here:
    // d14 has the line carry its own business date, d19 makes that a calendar
    // day, and step 15's export gathers a range BY those dates. `10/09/2026`
    // sorts before `2026-01-01`, so the line is dropped from every range rather
    // than filed in the wrong one — and Suspense cannot catch it, because the
    // journal is perfectly balanced and in no period at all.
    const { unresolved } = buildInv(invoice({ invoiceDate: "10/09/2026" }));

    expect(unresolved.join(" ")).toContain("not a calendar date");
  });

  it("has no second figure to put in Second-hand purchases (d2)", () => {
    // d2 wants the difference between a copy's nominal booked cost and what was
    // actually paid. E-02's second-hand intake records one cost per line.
    const { unresolved } = buildInv(invoice({ intakeMode: "Second-hand", statedSubtotal: 20 }));

    expect(unresolved.join(" ")).toContain("Second-hand purchases");
  });
});

// ---------------------------------------------------------------------------

const batch = (over: Partial<PaymentBatch> = {}): PaymentBatch =>
  ({
    id: "pb-1",
    supplierId: "sup-1",
    method: "Cheque",
    reference: "Cheque 101",
    date: "2026-09-13",
    recordedBy: "Y",
    createdAt: "2026-09-13 11:00:00",
    targets: [{ kind: "invoice", id: "inv-1", amount: 30, settleKind: "money" }],
    credits: [],
    ...over,
  }) as PaymentBatch;

const buildPay = (b: PaymentBatch, reversalOf?: { voidId: string; voidedAt: string }) =>
  buildPaymentJournal({ batch: b, writtenAt: "2026-09-13 11:00:00", accounts: CHART.accounts, currency: "CAD", reversalOf });

describe("M-07 d12 — a PaymentBatch writes its own journal at record", () => {
  it("debits Accounts Payable and credits the bank it drew on (A-65)", () => {
    const { batch: j } = buildPay(batch());

    expect(lineFor(j, acct("2100"))?.debit).toBe(30);
    expect(lineFor(j, acct("1010"))?.credit).toBe(30);
    expect(j.source).toBe("payment:pb-1");
    expect(isImbalanced(j)).toBe(false);
  });

  it("does not wait for a close and has nothing to sweep it", () => {
    // d12 explicitly rejects a month-end posting routine: it would be a period
    // close by another name, and would add a posted/unposted state that can be
    // forgotten, run twice, or need undoing.
    const { batch: j } = buildPay(batch());
    expect(j.lines.every((l) => l.businessDate === "2026-09-13")).toBe(true);
  });

  it("reports a settlement made with supplier credit rather than posting half of it", () => {
    // M-05 d19 lets one batch carry money and claim credit. The money half is
    // decided both sides; the credit half has no earlier entry to reverse,
    // because d12 names three artifacts that write journals and a supplier
    // claim is not one of them. Posting the debit alone would send the
    // difference to Suspense and report a decision as a defect.
    const { batch: j, unresolved } = buildPay(
      batch({
        targets: [
          { kind: "invoice", id: "inv-1", amount: 20, settleKind: "money" },
          { kind: "invoice", id: "inv-1", amount: 10, settleKind: "credit" },
        ],
      }),
    );

    expect(unresolved.join(" ")).toContain("settled by supplier credit");
    expect(lineFor(j, acct("2100"))?.debit).toBe(20);
    expect(isImbalanced(j)).toBe(false);
  });
});

describe("M-07 d8 — a void posts forward, dated when it was made", () => {
  it("reverses the entry on the void's date and leaves the original alone", () => {
    const original = buildPay(batch()).batch;
    const reversal = buildPay(batch(), { voidId: "void-9", voidedAt: "2026-09-20 15:00:00" }).batch;

    // The original is untouched — this is a SECOND journal, never an edit.
    expect(original.lines.every((l) => l.businessDate === "2026-09-13")).toBe(true);
    expect(reversal.lines.every((l) => l.businessDate === "2026-09-20")).toBe(true);
    // And it is the mirror image: what was debited is credited.
    expect(lineFor(reversal, acct("2100"))?.credit).toBe(30);
    expect(lineFor(reversal, acct("1010"))?.debit).toBe(30);
    expect(reversal.source).toBe("payment-void:void-9");
  });

  it("never restates a day that may already have been exported", () => {
    // "This is what keeps a period that has been exported, imported and filed
    // from moving under the person who filed it."
    const reversal = buildPay(batch(), { voidId: "void-9", voidedAt: "2026-10-02 09:00:00" }).batch;
    expect(reversal.lines.some((l) => l.businessDate.startsWith("2026-09"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("M-07 d6/d12 — an adjustment posts to the account its reason code maps to", () => {
  const buildAdj = (reason: Parameters<typeof buildAdjustmentJournal>[0]["reason"], cost: number) =>
    buildAdjustmentJournal({
      id: "adj-1",
      reason,
      cost,
      businessDate: "2026-09-16",
      writtenAt: "2026-09-16 14:00:00",
      memo: "Copy written off on return",
      accounts: CHART.accounts,
      mappings: CHART.mappings,
      currency: "CAD",
    });

  it("keeps Shrinkage and Damaged in different accounts (d6)", () => {
    // "The six exist because a Manager is made to choose between them, and
    // collapsing them in the ledger throws away the only thing that choice
    // was for."
    const shrink = buildAdj("Shrinkage", 8).batch;
    const damaged = buildAdj("Damaged", 8).batch;

    const shrinkAcct = shrink.lines.find((l) => l.debit === 8)!.accountId;
    const damagedAcct = damaged.lines.find((l) => l.debit === 8)!.accountId;
    expect(shrinkAcct).not.toBe(damagedAcct);
  });

  it("takes the cost out of Inventory when stock goes, and puts it back when stock is found", () => {
    const gone = buildAdj("Written off", 8).batch;
    expect(lineFor(gone, acct("1200"))?.credit).toBe(8);

    const found = buildAdj("Found", -8).batch;
    expect(lineFor(found, acct("1200"))?.debit).toBe(8);
    expect(found.lines.find((l) => l.accountId !== acct("1200"))?.credit).toBe(8);
  });

  it("names the artifact behind it and balances", () => {
    const { batch: j } = buildAdj("Shrinkage", 8);
    expect(j.source).toBe("adjustment:adj-1");
    expect(isImbalanced(j)).toBe(false);
  });
});
