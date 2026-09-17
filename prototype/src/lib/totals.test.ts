import { describe, expect, it } from "vitest";
import { balanceDue, tenderedTotal, tenderedTowardSale, type TaxContext } from "./totals";
import type { Sale, SaleLine, Tender } from "../data/types";

const ctx: TaxContext = { types: [], cells: [], groupId: "g", at: "2026-09-16 10:00:00" };

const line = (price: number): SaleLine =>
  ({ id: "l", kind: "item", title: "A — T", qty: 1, price, discountPct: 0, productTaxCode: "1", tax: [] }) as SaleLine;

const sale = (lines: SaleLine[], tenders: Tender[]): Sale =>
  ({ id: "s", state: "Open", lines, tenders, createdBy: "Y", createdAt: "2026-09-16 10:00:00", log: [] }) as Sale;

const t = (type: Tender["type"], amount: number, over: Partial<Tender> = {}): Tender =>
  ({ id: `t-${type}-${amount}`, type, amount, ...over }) as Tender;

describe("E-05 d35 — a pay-out funds itself", () => {
  it("settles a Sale that is nothing but a pay-out", () => {
    // d16 calls it "cash removed from the till for an expense". Before d35 the
    // till read this as $20 still owing and made the operator clear it with an
    // offsetting cash tender — which recorded $20 that never entered the
    // drawer, and left nothing saying which of the two tenders was the phantom.
    const payout = sale([], [t("Pay-out", -20, { note: "courier COD" })]);

    expect(balanceDue(payout, ctx)).toBe(0);
  });

  it("leaves a real Sale owing exactly what it owes, pay-out or no pay-out", () => {
    const withPayout = sale([line(30)], [t("Pay-out", -8, { note: "window cleaner" })]);
    expect(balanceDue(withPayout, ctx)).toBe(30);

    const settled = sale([line(30)], [t("Cash", 30), t("Pay-out", -8, { note: "window cleaner" })]);
    expect(balanceDue(settled, ctx)).toBe(0);
  });

  it("keeps Account Balance (add) counted, because that one really is funded", () => {
    // The customer hands over cash to put on their account: two real halves,
    // and netting them to zero is correct. A pay-out has no second half — the
    // drawer is the second half — which is the whole distinction d35 draws.
    const topUp = sale([], [t("Cash", 50), t("Account Balance", -50, { accountDirection: "add" })]);

    expect(balanceDue(topUp, ctx)).toBe(0);
    // And on its own it is still owing, exactly as before: the cash has to come.
    const unfunded = sale([], [t("Account Balance", -50, { accountDirection: "add" })]);
    expect(balanceDue(unfunded, ctx)).toBe(50);
  });
});

describe("what moved is not what settled", () => {
  it("still counts a pay-out as money that moved, which is what a void needs", () => {
    // `tenderedTotal` answers "how much is unaccounted for if this Sale goes
    // away" — and a pay-out is cash that genuinely left the drawer, so voiding
    // the paperwork does not put it back. The two figures differ on purpose.
    const mixed = sale([line(30)], [t("Cash", 30), t("Pay-out", -8, { note: "window cleaner" })]);

    expect(tenderedTotal(mixed)).toBe(22);
    expect(tenderedTowardSale(mixed)).toBe(30);
  });
});
