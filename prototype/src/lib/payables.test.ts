import { describe, expect, it } from "vitest";
import { creditDrawdown, settlementPlan, type LedgerRow } from "./payables";
import { creditIsConsumed } from "./totals";
import type { PaymentBatch, PaymentBatchVoid } from "../data/types";

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
