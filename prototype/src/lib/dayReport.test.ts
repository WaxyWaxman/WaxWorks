import { describe, expect, it } from "vitest";
import { GENRES, SECTIONS, TAX_TYPES } from "../data/seed";
import type { Customer, GLAccount, GLMapping, RecordEntry, Sale, SaleLine, TenderRow } from "../data/types";
import { computeDayBreakdown } from "./dayBreakdown";
import type { TaxContext } from "./totals";

// The eight-section report — M-03 d17, d18, d19, d20, d21, d22, d23, d24,
// d25, d26 and d28. One describe per section, each naming the decisions it
// asserts, so `grep "M-03 d19"` finds what holds it.

const ctx = (spec: string): TaxContext => ({
  types: TAX_TYPES,
  cells: [{ groupId: "tg-qc", productTaxCode: "1", spec }],
  groupId: "tg-qc",
  at: "2026-09-15",
});

// The Section is reached through the genre's mandatory parent (M-06 d32), so
// the fixture picks a real genre rather than inventing a taxonomy.
const vinylSection = SECTIONS.find((s) => s.name === "VINYL")!;
const VINYL = GENRES.find((g) => g.section === vinylSection.code)!;

const record = (id: string): RecordEntry => ({
  id,
  artist: "A",
  title: "T",
  label: "L",
  catalogNo: "C",
  format: "LP",
  year: 2026,
  country: "CA",
  genreId: VINYL.id,
  art: "💿",
  minOnHand: 0,
});

const line = (over: Partial<SaleLine> = {}): SaleLine => ({
  id: `l-${Math.random()}`,
  kind: "item",
  recordId: "r1",
  title: "line",
  qty: 1,
  price: 10,
  discountPct: 0,
  productTaxCode: "1",
  ...over,
});

const sale = (over: Partial<Sale> = {}): Sale =>
  ({
    id: `s-${Math.random()}`,
    state: "Current",
    lines: [line()],
    tenders: [],
    log: [],
    createdBy: "JD",
    createdAt: "2026-09-15T13:00:00.000Z",
    tenderedAt: "2026-09-15T13:00:00.000Z",
    ...over,
  }) as unknown as Sale;

const run = (sales: Sale[], extras = {}, cell = "ab") =>
  computeDayBreakdown(sales, [record("r1")], ctx(cell), [], GENRES, SECTIONS, extras);

describe("§1 File info — M-03 d18, d3: bounds the BATCH, never the calendar day", () => {
  it("takes start and end from the data's own bounds, not the period's", () => {
    const b = run([
      sale({ tenderedAt: "2026-09-15T17:05:00.000Z" }),
      sale({ tenderedAt: "2026-09-15T12:00:00.000Z" }),
    ]);
    expect(b.fileInfo.start).toBe("2026-09-15T12:00:00.000Z");
    expect(b.fileInfo.end).toBe("2026-09-15T17:05:00.000Z");
  });

  it("reads an empty batch as no bounds at all, never as the close's own stamp", () => {
    const b = run([], { createdAt: "2026-09-15T19:30:00.000Z" });
    expect(b.fileInfo.start).toBeNull();
    expect(b.fileInfo.end).toBeNull();
    // d18 — `created` is the one of the three that moves between two runs over
    // one batch, which is what makes a printed tape say WHEN it was true.
    expect(b.fileInfo.createdAt).toBe("2026-09-15T19:30:00.000Z");
  });

  it("gives two runs over one batch the same bounds and different created stamps", () => {
    const sales = [sale()];
    const first = run(sales, { createdAt: "2026-09-15T14:00:00.000Z" });
    const second = run(sales, { createdAt: "2026-09-15T16:00:00.000Z" });
    expect(second.fileInfo.start).toBe(first.fileInfo.start);
    expect(second.fileInfo.end).toBe(first.fileInfo.end);
    expect(second.fileInfo.createdAt).not.toBe(first.fileInfo.createdAt);
  });
});

describe("§2 Sales — M-03 d19, d7: the block reconciles to net sales", () => {
  it("carries the Section CODE beside the name (M-06 d28)", () => {
    expect(run([sale()]).bySection[0].code).toBe(vinylSection.code);
  });

  it("splits retail and discount, so the discount column is a real subtraction", () => {
    const row = run([sale({ lines: [line({ qty: 2, price: 10, discountPct: 10 })] })]).bySection[0];
    expect(row.retail).toBe(20);
    expect(row.discount).toBe(2);
    expect(row.net).toBe(18);
  });

  it("nets a matched Return INTO ITS OWN SECTION, so the rows sum to net sales", () => {
    const b = run([sale({ lines: [line({ qty: 2, price: 10 })] }), sale({ lines: [line({ qty: -1, price: 10 })] })]);
    // One Section row, not a returns bucket belonging to no Section.
    expect(b.bySection).toHaveLength(1);
    expect(b.bySection[0].items).toBe(1);
    expect(b.bySection[0].net).toBe(10);
    // And that is the figure this flow has reported since d7.
    expect(b.bySection.reduce((n, r) => n + r.net, 0)).toBe(b.netSales);
  });

  it("gives the footer a discount percentage over retail, and an average sale", () => {
    const b = run([
      sale({ lines: [line({ qty: 1, price: 100, discountPct: 10 })] }),
      sale({ lines: [line({ qty: 1, price: 100 })] }),
    ]);
    expect(b.salesFooter.retail).toBe(200);
    expect(b.salesFooter.discount).toBe(10);
    expect(b.salesFooter.discountPctOfSales).toBe(5);
    expect(b.salesFooter.averageSale).toBe(95); // 190 / 2
  });

  it("counts a $0.00 counter buy as a transaction, dragging the average down (d19)", () => {
    const b = run([sale({ lines: [line({ qty: 1, price: 100 })] }), sale({ lines: [] })]);
    expect(b.salesFooter.transactions).toBe(2);
    expect(b.salesFooter.averageSale).toBe(50);
  });

  it("reports no percentage rather than a percentage of nothing", () => {
    expect(run([]).salesFooter.discountPctOfSales).toBeNull();
    expect(run([]).salesFooter.averageSale).toBeNull();
  });
});

describe("§3 Taxes — M-03 d20 / M-06 d16: each tax carries its OWN base", () => {
  it("gives a compounded pair two different bases, differing by exactly the first tax", () => {
    // M-06 d16 — `ab+`: b is charged on the subtotal PLUS a. The two are
    // remitted to different authorities, so one shared base would misstate one
    // of them on the report a shop hands its accountant.
    const b = run([sale({ lines: [line({ qty: 1, price: 100 })] })], {}, "ab+");
    const [a, second] = b.byTaxLine;
    expect(a.base).toBe(100);
    expect(second.base).toBe(100 + a.amount);
    expect(second.base).toBeGreaterThan(a.base);
  });

  it("gives a NON-compound pair one shared base", () => {
    const b = run([sale({ lines: [line({ qty: 1, price: 100 })] })], {}, "ab");
    expect(b.byTaxLine[0].base).toBe(100);
    expect(b.byTaxLine[1].base).toBe(100);
  });

  it("counts per Sale LINE, not per Sale", () => {
    const b = run([sale({ lines: [line(), line(), line()] })]);
    expect(b.byTaxLine[0].count).toBe(3);
  });
});

describe("§4 Tenders/Misc — M-03 d21, d14, d16 / M-07 d21, d26 / A-66: the grouped total is undeposited funds", () => {
  const cashRow: TenderRow = { id: "tn-cash", name: "Cash", behavior: "Cash", active: true };
  const cardRow: TenderRow = { id: "tn-visa", name: "Visa", behavior: "Credit Card", active: true };
  const undepositedAcct: GLAccount = { id: "a-und", role: "undeposited", number: "1100", name: "Undeposited funds", active: true };
  const secondHandAcct: GLAccount = { id: "a-sh", role: "second-hand-purchases", number: "5200", name: "Second-hand purchases", active: true };
  const usedRow: TenderRow = { id: "tn-used", name: "Used credit", behavior: "Used Credit", active: true };
  const mappings: GLMapping[] = [
    { seamKind: "tender", seamId: "tn-cash", accountId: "a-und" },
    { seamKind: "tender", seamId: "tn-visa", accountId: "a-und" },
    { seamKind: "tender", seamId: "tn-used", accountId: "a-sh" },
  ];
  const chart = {
    tenderRows: [cashRow, cardRow, usedRow],
    accounts: [undepositedAcct, secondHandAcct],
    mappings,
  };

  const tendered = (type: Sale["tenders"][number]["type"], amount: number, tenderRowId: string) =>
    sale({ tenders: [{ id: `t-${Math.random()}`, type, amount, tenderRowId }] });

  it("names the GL account each tender posts to (M-07 d21)", () => {
    const b = run([tendered("Cash", 40, "tn-cash")], chart);
    expect(b.byTender[0].account).toBe("Undeposited funds");
  });

  it("totals cash and card as UNDEPOSITED FUNDS, and never as a bank total", () => {
    const b = run([tendered("Cash", 40, "tn-cash"), tendered("Credit Card", 60, "tn-visa")], chart);
    expect(b.undepositedTotal).toBe(100);
    // A-66 — money reaches a bank account only through a BankDeposit, so no
    // figure here may be labelled or computed as a bank balance.
    expect(b.byTender.every((t) => !/bank/i.test(t.account ?? ""))).toBe(true);
  });

  it("puts Used Credit under Second-hand purchases, outside the undeposited group (M-07 d26)", () => {
    const b = run([tendered("Used Credit", 20, "tn-used")], chart);
    expect(b.byTender[0].account).toBe("Second-hand purchases");
    expect(b.byTender[0].undeposited).toBe(false);
    expect(b.undepositedTotal).toBeNull();
  });

  it("keeps d16's pay-out row and Cash, net inside the undeposited group", () => {
    const b = run(
      [tendered("Cash", 100, "tn-cash"), tendered("Pay-out", -20, "tn-cash")],
      chart,
    );
    expect(b.byTender.map((t) => t.label)).toContain("Cash — pay-outs");
    expect(b.cashNet).toBe(80);
    expect(b.undepositedTotal).toBe(80);
  });

  it("splits Account Balance by direction, so $100 each way is not $0 (d14)", () => {
    const b = run([
      sale({ tenders: [{ id: "t1", type: "Account Balance", amount: 100, accountDirection: "add" }] }),
      sale({ tenders: [{ id: "t2", type: "Account Balance", amount: -100, accountDirection: "draw" }] }),
    ]);
    expect(b.byTender).toHaveLength(2);
    expect(b.byTender.map((t) => t.amount).sort()).toEqual([-100, 100]);
  });
});

describe("§5 Sales by customer type — M-03 d22 / E-05 d30: Account type, plus Walk-in", () => {
  const cust = (id: string, accountType: Customer["accountType"], name: string): Customer =>
    ({ id, accountType, name }) as unknown as Customer;
  const customers = [cust("c1", "Staff", "Sam"), cust("c2", "Business", "Left Bank Cafe")];

  it("splits on the Customer's Account type and calls a Sale with none Walk-in", () => {
    const b = run(
      [sale({ customerId: "c1" }), sale({ customerId: "c2" }), sale({})],
      { customers },
    );
    expect(b.byCustomerType.map((r) => r.label)).toEqual(["Staff", "Business", "Walk-in"]);
  });

  it("makes Staff separable, which is the row that earns the split", () => {
    const b = run(
      [sale({ customerId: "c1", lines: [line({ qty: 1, price: 50, discountPct: 20 })] }), sale({})],
      { customers },
    );
    const staff = b.byCustomerType.find((r) => r.label === "Staff")!;
    expect(staff.discount).toBe(10);
    expect(staff.net).toBe(40);
  });

  it("reports everything as Walk-in when no customer list is supplied", () => {
    const b = run([sale({ customerId: "c1" })]);
    expect(b.byCustomerType.map((r) => r.label)).toEqual(["Walk-in"]);
  });
});

describe("§6 Sales per hour — M-03 d23 / M-07 d19 / A-73: only the hours that rang something", () => {
  const at = (hourLocal: number) => {
    const d = new Date("2026-09-15T00:00:00");
    d.setHours(hourLocal, 15, 0, 0);
    return d.toISOString();
  };

  it("prints a row per ACTIVE hour and none for the quiet ones between", () => {
    const b = run([sale({ tenderedAt: at(11) }), sale({ tenderedAt: at(11) }), sale({ tenderedAt: at(14) })]);
    expect(b.perHour.map((h) => h.hour)).toEqual([11, 14]);
    expect(b.perHour[0].transactions).toBe(2);
  });

  it("keys on the TENDER moment, so a Hold rung at 11 and tendered at 14 files at 14", () => {
    const b = run([sale({ createdAt: at(11), tenderedAt: at(14) })]);
    expect(b.perHour.map((h) => h.hour)).toEqual([14]);
  });
});

describe("§7 Sales by Employee — M-03 d24 / E-05 d23: attribution and the discount RATE", () => {
  it("attributes to whoever held the lock at tender (E-05 d23, via createdBy)", () => {
    const b = run([sale({ createdBy: "AB" }), sale({ createdBy: "CD" }), sale({ createdBy: "CD" })]);
    expect(b.byEmployee.map((e) => [e.employee, e.transactions])).toEqual([
      ["AB", 1],
      ["CD", 2],
    ]);
  });

  it("averages discount over the ITEMS DISCOUNTED, not over all items", () => {
    // d24 — four items, one discounted $10. The figure is $10.00, not $2.50:
    // averaging in the lines that took no discount buries the signal under
    // whoever happened to be on a quiet shift.
    const b = run([
      sale({
        createdBy: "AB",
        lines: [line({ qty: 1, price: 100, discountPct: 10 }), line(), line(), line()],
      }),
    ]);
    expect(b.byEmployee[0].avgDiscount).toBe(10);
  });

  it("reports no average where they discounted nothing, rather than zero", () => {
    expect(run([sale({ createdBy: "AB" })]).byEmployee[0].avgDiscount).toBeNull();
  });

  it("counts returns and their value against whoever took them", () => {
    const b = run([sale({ createdBy: "AB", lines: [line({ qty: -2, price: 10 })] })]);
    expect(b.byEmployee[0].returns).toBe(2);
    expect(b.byEmployee[0].returnsValue).toBe(-20);
  });
});

describe("§8 Tendering details — M-03 d25 / E-05 d30: grouped by tender, not by Sale", () => {
  it("lists a split tender ONCE PER TENDER, both lines carrying the same Sale number", () => {
    const b = run([
      sale({
        saleNumber: 1042,
        tenders: [
          { id: "t1", type: "Cash", amount: 20 },
          { id: "t2", type: "Credit Card", amount: 16.2 },
        ],
      }),
    ]);
    const labels = b.tenderingDetails.map((g) => g.label).sort();
    expect(labels).toEqual(["Cash", "Credit Card"]);
    expect(b.tenderingDetails.every((g) => g.rows[0].saleNumber === "#1042")).toBe(true);
  });

  it("sums each group to that tender's own total in §4", () => {
    const b = run([
      sale({ tenders: [{ id: "t1", type: "Cash", amount: 20 }] }),
      sale({ tenders: [{ id: "t2", type: "Cash", amount: 30 }] }),
    ]);
    const group = b.tenderingDetails.find((g) => g.label === "Cash")!;
    const tender = b.byTender.find((t) => t.label === "Cash")!;
    expect(group.rows.reduce((n, r) => n + r.amount, 0)).toBe(tender.amount);
  });

  it("says Walk-in where the Sale carries no Customer (E-05 d30)", () => {
    const b = run([sale({ tenders: [{ id: "t1", type: "Cash", amount: 5 }] })]);
    expect(b.tenderingDetails[0].rows[0].customer).toBe("Walk-in");
  });
});

describe("M-03 d26 — a void is counted and never valued", () => {
  const voided = (over: Partial<Sale> = {}) =>
    sale({ state: "Void", lines: [line({ qty: 1, price: 400 })], ...over });

  it("reports a $400 void and a $4 void identically", () => {
    const b = run([voided(), voided({ lines: [line({ qty: 1, price: 4 })] })]);
    expect(b.voidCount).toBe(2);
    // Nothing anywhere carries a void's money.
    expect(JSON.stringify(b.perHour)).not.toContain("400");
    expect(b.byEmployee.every((e) => !("voidValue" in e))).toBe(true);
  });

  it("counts a void against its Employee and against its hour", () => {
    const b = run([voided({ createdBy: "AB" })]);
    expect(b.byEmployee.find((e) => e.employee === "AB")!.voids).toBe(1);
    expect(b.perHour.find((h) => h.voids === 1)).toBeTruthy();
  });

  it("scopes the count to the period, not to everything in memory", () => {
    // The honest approximation, and the open question architecture §11 names:
    // a voided Sale carries no batch, so its own createdAt against the last
    // close is the best available — system-written facts only.
    const old = voided({ createdAt: "2026-09-10T10:00:00.000Z" });
    const now = voided({ createdAt: "2026-09-15T10:00:00.000Z" });
    expect(run([old, now], { sinceClosedAt: "2026-09-14T19:30:00.000Z" }).voidCount).toBe(1);
    expect(run([old, now]).voidCount).toBe(2);
  });

  it("does not count a cancelled Hold as a void", () => {
    const b = run([voided({ log: [{ at: "x", text: "Hold cancelled by JD" }] })]);
    expect(b.voidCount).toBe(0);
    expect(b.holdsCancelledCount).toBe(1);
  });
});
