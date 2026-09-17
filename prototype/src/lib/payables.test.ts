import { describe, expect, it } from "vitest";
import {
  batchMoneyPaid,
  clearedAgainst,
  creditDrawdown,
  duplicateReference,
  entryIsCleared,
  settlementPlan,
  unclearRefusal,
  type LedgerRow,
} from "./payables";
import { creditIsConsumed, invoiceIsFrozen } from "./totals";
import type { Clearing, Invoice, PayableEntry, PaymentBatch, PaymentBatchVoid } from "../data/types";

/**
 * The first tests over payables. They exist because a scoping pass found a live
 * double count here with nothing asserting against it, and because M-05's
 * decisions had no test coverage at all.
 */

const credit = (key: string, amount: number): LedgerRow => ({
  key,
  kind: "entry",
  id: key,
  type: "Credit",
  reference: key,
  termsFrom: "2026-09-01",
  amount: -amount,
  face: -amount,
  netted: null,
  balance: -amount,
  status: "Open",
  band: "counted",
  role: "credit",
  creditId: key,
});

const debit = (key: string, amount: number): LedgerRow => ({
  key,
  kind: "invoice",
  id: key,
  type: "Invoice",
  reference: key,
  termsFrom: "2026-09-01",
  amount,
  face: amount,
  netted: null,
  balance: amount,
  status: "Open",
  band: "counted",
  role: "debit",
});

describe("M-05 d27 — whatever cannot attach stays as it was", () => {
  it("leaves no remainder for a credit the drawdown never reaches", () => {
    // $30 owed, C1 = $40 and C2 = $30 both ticked. C1 covers the debt on its
    // own, so C2 is never reached and is not part of the settlement.
    const drawn = creditDrawdown(
      [
        { id: "C1", amount: 40 },
        { id: "C2", amount: 30 },
      ],
      30,
    );

    expect(drawn).toEqual([
      { id: "C1", drawn: 30, left: 10, touched: true },
      { id: "C2", drawn: 0, left: 30, touched: false },
    ]);
  });

  it("emits a remainder only for the credit it straddles (d28 — consumed whole)", () => {
    const plan = settlementPlan([debit("INV", 30), credit("C1", 40), credit("C2", 30)]);

    expect(plan.attach).toBe(30);
    expect(plan.money).toBe(0);
    // The bug this replaces reported `creditTotal - attach` = $40, counting the
    // untouched C2, and the store then emitted artifacts to match.
    expect(plan.remainder).toBe(10);
  });
});

describe("M-05 d26 — applying a credit never moves the balance", () => {
  it("holds across a settlement that leaves one credit untouched", () => {
    const rows = [debit("INV", 30), credit("C1", 40), credit("C2", 30)];
    const before = rows.reduce((n, r) => n + r.balance, 0);
    const plan = settlementPlan(rows);

    // After settling: the debit is covered, the straddled credit is consumed
    // whole and comes back as `remainder`, and the untouched credit still
    // stands at its own value.
    const after = -plan.remainder - 30;

    expect(before).toBe(-40);
    expect(after).toBe(-40);
  });
});

describe("M-05 d28 — a credit consumed by a settlement is consumed whole", () => {
  it("consumes a single credit whole and remainders the excess", () => {
    // d28's own worked example: a $20.00 Invoice settled with a $34.00 Credit
    // produces a $14.00 remainder rather than leaving the original at $14.00.
    const plan = settlementPlan([debit("INV", 20), credit("C1", 34)]);

    expect(plan.attach).toBe(20);
    expect(plan.remainder).toBe(14);
  });

  it("leaves nothing behind when the credit lands exactly", () => {
    const plan = settlementPlan([debit("INV", 25), credit("C1", 25)]);

    expect(plan.attach).toBe(25);
    expect(plan.remainder).toBe(0);
  });

  it("takes money for the shortfall and remainders nothing (d27)", () => {
    const plan = settlementPlan([debit("INV", 100), credit("C1", 40)]);

    expect(plan.attach).toBe(40);
    expect(plan.money).toBe(60);
    expect(plan.remainder).toBe(0);
  });
});

const batch = (id: string, credits: { creditId: string; amount: number }[]): PaymentBatch => ({
  id,
  supplierId: "sup",
  method: "Cheque",
  reference: "Cheque 101",
  date: "2026-09-16",
  recordedBy: "MT",
  createdAt: "2026-09-16 10:00:00",
  targets: [{ kind: "invoice", id: "INV", amount: 30, settleKind: "credit" }],
  credits,
});

describe("A-69 / M-05 d42 — consumed is derived from the batch, not from a target", () => {
  it("counts a credit the batch names as consumed", () => {
    const b = batch("b1", [{ creditId: "C1", amount: 30 }]);

    expect(creditIsConsumed("C1", [b], [])).toBe(true);
  });

  it("does not count a credit the batch does not name (d27)", () => {
    // C2 was ticked but the drawdown never reached it, so the batch does not
    // name it. This is the case the retired target-based derivation could not
    // answer, and the reason a remainder was emitted for a credit that still
    // read as un-consumed.
    const b = batch("b1", [{ creditId: "C1", amount: 30 }]);

    expect(creditIsConsumed("C2", [b], [])).toBe(false);
  });

  it("un-consumes when the batch is voided, with nothing to flip (d22, A-33a)", () => {
    const b = batch("b1", [{ creditId: "C1", amount: 30 }]);
    const voided: PaymentBatchVoid[] = [
      { id: "v1", batchId: "b1", voidedAt: "2026-09-17 09:00:00", voidedBy: "MT" },
    ];

    expect(creditIsConsumed("C1", [b], [])).toBe(true);
    expect(creditIsConsumed("C1", [b], voided)).toBe(false);
  });
});

describe("M-05 d43 — credits draw down in tick order, not ledger order", () => {
  const ticked = (row: LedgerRow, order: number): LedgerRow => ({ ...row, tickOrder: order });

  it("overflows the credit ticked last, not the oldest one", () => {
    // $30 owed. C1 and C2 are worth $40 and $30. Ledger order is oldest first,
    // which is what d43 refuses — "d11's automatic distribution wearing a
    // different hat". Ticking C2 first must make C2 the one drawn on.
    const plan = settlementPlan([
      debit("INV", 30),
      ticked(credit("C1", 40), 2),
      ticked(credit("C2", 30), 1),
    ]);

    expect(plan.credits.map((c) => c.key)).toEqual(["C2", "C1"]);
    // C2 is drawn to exhaustion; C1 is never reached and stays as it is (d27).
    expect(plan.drawdown).toEqual([
      { id: "C2", drawn: 30, left: 0, touched: true },
      { id: "C1", drawn: 0, left: 40, touched: false },
    ]);
    expect(plan.remainder).toBe(0);
  });

  it("re-ticking the other way round changes which credit overflows", () => {
    const plan = settlementPlan([
      debit("INV", 30),
      ticked(credit("C1", 40), 1),
      ticked(credit("C2", 30), 2),
    ]);

    // Now C1 straddles: consumed whole, $10 back as a remainder (d28).
    expect(plan.drawdown[0]).toEqual({ id: "C1", drawn: 30, left: 10, touched: true });
    expect(plan.remainder).toBe(10);
  });
});

describe("M-05 d46/d47/d48 — a clearing is an artifact, reversed whole, and removed", () => {
  const clearing = (memberIds: string[]): Clearing => ({
    id: "clr-1",
    supplierId: "sup",
    memberIds,
    clearedAt: "2026-09-16 10:00:00",
    clearedBy: "MT",
  });

  const entry = (id: string, over: Partial<PayableEntry> = {}): PayableEntry => ({
    id,
    supplierId: "sup",
    type: "Credit",
    reference: id,
    date: "2026-09-01",
    subtotal: 10,
    tax: 0,
    freight: 0,
    misc: 0,
    createdBy: "MT",
    createdAt: "2026-09-01 10:00:00",
    log: [],
    ...over,
  });

  it("derives cleared from the clearing naming the entry, not from the entry", () => {
    // A-37's shape. It is what lets d48 reverse by REMOVING the clearing: the
    // members come back by the absence of the row, with nothing to flip.
    expect(entryIsCleared("A", [clearing(["A", "B"])])).toBe(true);
    expect(entryIsCleared("C", [clearing(["A", "B"])])).toBe(false);
  });

  it("un-clears the whole clearing, so there is no partial case to refuse (d47)", () => {
    expect(unclearRefusal(clearing(["A", "B"]))).toBeUndefined();
  });

  it("refuses a clearing that no longer exists — d48 removed it", () => {
    expect(unclearRefusal(undefined)).toMatch(/no longer exists/);
  });

  it("refuses a clearing that cannot satisfy d15's sum-to-zero", () => {
    expect(unclearRefusal(clearing(["A"]))).toMatch(/at least two members/);
  });

  it("names the siblings, which is A-70's fourth condition", () => {
    // d48 removes the clearing, so "cleared against 2 other entries" would lose
    // WHICH two. A-70 makes naming them a condition of the deletion being
    // permitted, so this is the only place the act survives the row.
    const members = [entry("A", { reference: "CLAIM-5000" }), entry("B", { reference: "CM-5000" })];

    expect(clearedAgainst("A", members)).toBe("CM-5000");
    expect(clearedAgainst("B", members)).toBe("CLAIM-5000");
  });

  it("names every sibling when a clearing has more than two members", () => {
    const members = [
      entry("A", { reference: "CLAIM-1" }),
      entry("B", { reference: "CM-1" }),
      entry("C", { reference: "ADJ-1" }),
    ];

    expect(clearedAgainst("A", members)).toBe("CM-1, ADJ-1");
  });

  it("leaves d27's settlement disposal alone — it is not a clearing", () => {
    // Stamped on the entry with its batch, and reversed by that batch's void
    // (d22), never by an un-clear. No clearing names it, so nothing here sees it.
    const disposed = entry("PH", { clearedAt: "2026-09-16 10:00:00", clearedInBatchId: "batch-1" });

    expect(entryIsCleared(disposed.id, [clearing(["A", "B"])])).toBe(false);
  });
});

describe("M-05 d37 â€” an Invoice is frozen while any live batch targets it", () => {
  const invoice = (over: Partial<Invoice> = {}): Invoice => ({
    id: "INV",
    supplierId: "sup",
    invoiceNumber: "55021",
    intakeMode: "New",
    invoiceDate: "2026-08-27",
    receivedDate: "2026-08-27",
    statedSubtotal: 100,
    tax: 0,
    freight: 0,
    misc: 0,
    status: "Finalized",
    lines: [],
    createdBy: "MT",
    createdAt: "2026-08-27 10:00:00",
    finalizedAt: "2026-08-27 11:00:00",
    log: [],
    ...over,
  });

  const paying = (amount: number): PaymentBatch => ({
    ...batch("b1", []),
    targets: [{ kind: "invoice", id: "INV", amount, settleKind: "money" }],
  });

  it("does not freeze an Invoice nothing has been paid against", () => {
    expect(invoiceIsFrozen(invoice(), [], [])).toBe(false);
  });

  it("freezes a PARTLY paid Invoice â€” the gap d37 closes", () => {
    // $100 invoice, $40 paid. Not paid, so A-41's invoiceIsPaid let every edit
    // through, and d22's void would then have returned money to a target that
    // no longer said what it said.
    expect(invoiceIsFrozen(invoice(), [paying(40)], [])).toBe(true);
  });

  it("freezes a fully paid one too â€” d37 is a superset of A-41, not a swap", () => {
    expect(invoiceIsFrozen(invoice(), [paying(100)], [])).toBe(true);
  });

  it("thaws when the batch is voided (d22, A-33a â€” immutable WHILE paid)", () => {
    const voided: PaymentBatchVoid[] = [
      { id: "v1", batchId: "b1", voidedAt: "2026-09-17 09:00:00", voidedBy: "MT" },
    ];

    expect(invoiceIsFrozen(invoice(), [paying(40)], voided)).toBe(false);
  });

  it("never freezes a draft, however odd its figures", () => {
    expect(invoiceIsFrozen(invoice({ finalizedAt: undefined, status: "Draft" }), [paying(40)], [])).toBe(false);
  });
});
describe("M-05 d5/d38 — a batch records what left the bank, not what it settled", () => {
  const rem = (id: string, amount: number, over: Partial<PayableEntry> = {}): PayableEntry => ({
    id,
    supplierId: "sup",
    type: "Credit",
    source: "remainder",
    reference: id,
    date: "2026-09-16",
    subtotal: amount,
    tax: 0,
    freight: 0,
    misc: 0,
    createdBy: "MT",
    createdAt: "2026-09-16 10:00:00",
    log: [],
    ...over,
  });

  const paid = (amount: number): PaymentBatch => ({
    ...batch("b1", []),
    targets: [{ kind: "invoice", id: "INV", amount, settleKind: "money" }],
  });

  it("counts the overpayment artifact back in", () => {
    // $80.00 cheque against a $68.65 Invoice. The target is capped at $68.65 so
    // the Invoice balance stays at zero (d8); the $11.35 is a Credit. The
    // statement says $80.00 and so must the payment history (d5).
    const over = rem("rem-1", 11.35, { fromBatchId: "b1" });

    expect(batchMoneyPaid(paid(68.65), [over])).toBe(80);
  });

  it("ignores a CREDIT's remainder — no money left the bank for that one", () => {
    // A credit consumed whole with change left over emits the same artifact,
    // but nothing was paid for it. `fromCreditId` is what tells them apart.
    const fromCredit = rem("rem-2", 10, { fromBatchId: "b1", fromCreditId: "C1" });

    expect(batchMoneyPaid(paid(68.65), [fromCredit])).toBe(68.65);
  });

  it("ignores another batch's remainders", () => {
    const other = rem("rem-3", 50, { fromBatchId: "b2" });

    expect(batchMoneyPaid(paid(68.65), [other])).toBe(68.65);
  });
});

describe("M-05 d41 — a duplicate bank reference warns, and says whether the match is voided", () => {
  const withRef = (id: string, reference: string, date = "2026-09-16"): PaymentBatch => ({
    ...batch(id, []),
    reference,
    date,
  });

  it("finds an earlier batch on the same reference", () => {
    const hit = duplicateReference("Cheque 101", [withRef("b1", "Cheque 101")], []);

    expect(hit).toEqual({ reference: "Cheque 101", date: "2026-09-16", voided: false });
  });

  it("reports the match as voided, which is the expected d40 case", () => {
    // After a void and a re-record the same cheque legitimately appears twice.
    // Saying so is what keeps the warning from becoming noise.
    const voids: PaymentBatchVoid[] = [
      { id: "v1", batchId: "b1", voidedAt: "2026-09-17 09:00:00", voidedBy: "MT" },
    ];

    expect(duplicateReference("Cheque 101", [withRef("b1", "Cheque 101")], voids)?.voided).toBe(true);
  });

  it("matches case-insensitively and ignores surrounding space", () => {
    // "cheque 101" and "Cheque 101 " are the same cheque to everyone except a
    // string comparison.
    expect(duplicateReference("  cheque 101 ", [withRef("b1", "Cheque 101")], [])).toBeDefined();
  });

  it("says nothing about an empty reference, or one nothing matches", () => {
    expect(duplicateReference("", [withRef("b1", "Cheque 101")], [])).toBeUndefined();
    expect(duplicateReference("   ", [withRef("b1", "Cheque 101")], [])).toBeUndefined();
    expect(duplicateReference("Cheque 999", [withRef("b1", "Cheque 101")], [])).toBeUndefined();
  });

  it("does not match a batch against itself", () => {
    expect(duplicateReference("Cheque 101", [withRef("b1", "Cheque 101")], [], "b1")).toBeUndefined();
  });
});
