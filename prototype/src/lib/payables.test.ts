import { describe, expect, it } from "vitest";
import {
  batchMoneyPaid,
  creditDrawdown,
  settlementPlan,
  unclearRefusal,
  type LedgerRow,
} from "./payables";
import { creditIsConsumed, invoiceIsFrozen } from "./totals";
import type { Invoice, PayableEntry, PaymentBatch, PaymentBatchVoid } from "../data/types";

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

describe("M-05 d39 — a clearing is reversible; a settlement's disposal is not", () => {
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

  const cleared = (id: string) =>
    entry(id, { clearedAt: "2026-09-16 10:00:00", clearedBy: "MT", clearedWith: ["other"] });

  it("allows un-clearing a pair a Manager cleared by hand (d15)", () => {
    expect(unclearRefusal([cleared("A"), cleared("B")])).toBeUndefined();
  });

  it("refuses a row a settlement retired, and says where to reverse it (d27, d22)", () => {
    // d27's placeholder disposal. Before `clearedInBatchId` existed this row
    // was indistinguishable from a d15 clearing, so an un-clear would have
    // reversed it — answering an open question by accident.
    const disposed = entry("PH", {
      reference: "Claim #12",
      clearedAt: "2026-09-16 10:00:00",
      clearedBy: "MT",
      clearedInBatchId: "batch-1",
    });

    expect(unclearRefusal([disposed])).toMatch(/retired by a settlement/);
    expect(unclearRefusal([disposed])).toMatch(/Void that settlement/);
  });

  it("refuses a mixed selection on the strength of the one disposal in it", () => {
    const disposed = entry("PH", {
      reference: "Claim #12",
      clearedAt: "2026-09-16 10:00:00",
      clearedBy: "MT",
      clearedInBatchId: "batch-1",
    });

    expect(unclearRefusal([cleared("A"), disposed])).toMatch(/retired by a settlement/);
  });

  it("refuses a row that is not cleared at all", () => {
    expect(unclearRefusal([entry("A")])).toMatch(/not cleared/);
  });
});

describe("M-05 d37 — an Invoice is frozen while any live batch targets it", () => {
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

  it("freezes a PARTLY paid Invoice — the gap d37 closes", () => {
    // $100 invoice, $40 paid. Not paid, so A-41's invoiceIsPaid let every edit
    // through, and d22's void would then have returned money to a target that
    // no longer said what it said.
    expect(invoiceIsFrozen(invoice(), [paying(40)], [])).toBe(true);
  });

  it("freezes a fully paid one too — d37 is a superset of A-41, not a swap", () => {
    expect(invoiceIsFrozen(invoice(), [paying(100)], [])).toBe(true);
  });

  it("thaws when the batch is voided (d22, A-33a — immutable WHILE paid)", () => {
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
