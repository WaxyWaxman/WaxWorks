import { describe, expect, it } from "vitest";
import { accountType, buildChart, seamsFor, unmappedSeams, type Seams } from "./chart";
import { ADJUSTMENT_REASONS, type SectionRow, type TaxType, type TenderRow } from "../data/types";

const section = (code: string, name: string, countsAsRevenue = true): SectionRow =>
  ({ code, name, countsAsRevenue, tracksStockDefault: true, discountable: true, returnable: true, active: true, sortOrder: 0 }) as SectionRow;

const tender = (id: string, name: string, behavior = "Credit Card"): TenderRow =>
  ({ id, name, behavior, active: true }) as TenderRow;

const tax = (code: string, name: string): TaxType => ({ code, name, ratePpm: 50_000 }) as TaxType;

const seams: Seams = {
  sections: [section("VI", "VINYL"), section("ME", "MERCH")],
  tenders: [tender("t-cash", "Cash"), tender("t-visa", "Visa"), tender("t-amex", "Amex")],
  taxTypes: [tax("a", "GST"), tax("b", "QST")],
};

describe("M-07 d26 — a counter buy debits Second-hand purchases", () => {
  it("maps the Used Credit tender to the reserved account rather than minting one", () => {
    const rows: TenderRow[] = [
      { id: "t-cash", name: "Cash", behavior: "Cash", active: true },
      { id: "t-used", name: "Used credit", behavior: "Used Credit", active: true },
    ] as TenderRow[];
    const { accounts, mappings } = buildChart({ ...seams, tenders: rows });

    const reserved = accounts.find((a) => a.role === "second-hand-purchases")!;
    const mapped = mappings.find((m) => m.seamKind === "tender" && m.seamId === "t-used");

    expect(mapped?.accountId).toBe(reserved.id);
    // And nothing extra was created for it — step 5 expressly allows two seams
    // pointing at one account, which is what this is.
    expect(accounts.filter((a) => a.role === "second-hand-purchases")).toHaveLength(1);
  });

  it("leaves every seam mapped, Used Credit included (d11)", () => {
    const rows: TenderRow[] = [
      { id: "t-cash", name: "Cash", behavior: "Cash", active: true },
      { id: "t-used", name: "Used credit", behavior: "Used Credit", active: true },
    ] as TenderRow[];
    const s = { ...seams, tenders: rows };
    expect(unmappedSeams(s, buildChart(s).mappings)).toEqual([]);
  });
});

describe("M-07 d11 — setup creates and maps every seam before anyone sees it", () => {
  it("leaves nothing unmapped, which is what makes Suspense a defect and not a hole", () => {
    const { mappings } = buildChart(seams);

    expect(unmappedSeams(seams, mappings)).toEqual([]);
  });

  it("reports what is missing when a seam has no account", () => {
    // The check has to be real, or d11's invariant is a comment. A seam added
    // after setup with no mapping is exactly d10's "discovered at the close,
    // the worst possible moment".
    const { mappings } = buildChart(seams);
    const later = { ...seams, tenders: [...seams.tenders, tender("t-later", "Interac")] };

    expect(unmappedSeams(later, mappings)).toEqual(["Tender Interac"]);
  });

  // M-07 d29 — the Section seam is SPARSE. A Section that counts as revenue
  // resolves by RULE to the reserved Sales role and has no mapping row to
  // leave null, so its absence is not a hole. Only a Section that is not
  // revenue keeps a mapping, because a dimension cannot decide
  // revenue-versus-liability (M-06 d20's gift card load).
  it("does not report a revenue Section as unmapped, because it resolves by rule (d29)", () => {
    const { mappings } = buildChart(seams);
    const later = { ...seams, sections: [...seams.sections, section("SO", "SOUL")] };

    expect(unmappedSeams(later, mappings)).toEqual([]);
  });

  it("still reports a NON-revenue Section with no mapping (d29)", () => {
    const { mappings } = buildChart(seams);
    const later = { ...seams, sections: [...seams.sections, section("GC", "GIFT CARDS", false)] };

    expect(unmappedSeams(later, mappings)).toEqual(["Section GIFT CARDS"]);
  });
});

describe("M-07 d5/d6 — the chart follows the seams that already exist", () => {
  // M-07 d28 — SUPERSEDES d6's revenue grain. Revenue resolves to ONE reserved
  // Sales role and the Section rides on the line as a dimension (M-08 d2), so
  // totalling sales across every Section and within one are the same query with
  // a different filter. The breakdown M-03 reports comes from the dimension.
  it("gives revenue a single reserved Sales account, not one per Section (d28)", () => {
    const { accounts } = buildChart(seams);
    const revenue = accounts.filter((a) => a.role === "revenue");

    expect(revenue).toHaveLength(1);
    expect(revenue[0].name).toBe("Sales");
  });

  it("gives every tender its own account, not every behavior (M-06 d22)", () => {
    // Visa and Amex settle as separate deposits; a merged figure cannot be tied
    // back to a bank statement.
    const { mappings } = buildChart(seams);

    expect(mappings.filter((m) => m.seamKind === "tender")).toHaveLength(3);
  });

  it("gives each tender the account KIND its behavior implies (d21)", () => {
    // d22's reason is about DEPOSITS, and it does not reach a gift card
    // redemption, where no money moves at all. Building the chart put five of
    // nine seeded tenders in the assets band, which is what this prevents.
    const mixed: Seams = {
      ...seams,
      tenders: [
        tender("t-cash", "Cash", "Cash"),
        tender("t-visa", "Visa", "Credit Card"),
        tender("t-gift", "Gift card", "Gift Card"),
        tender("t-acct", "On account", "Account Balance"),
        tender("t-used", "Used credit", "Used Credit"),
        tender("t-pay", "Pay-out", "Pay-out"),
      ],
    };
    const roleOf = (name: string) =>
      buildChart(mixed).accounts.find((a) => a.name.endsWith(`— ${name}`))?.role;

    expect(roleOf("Cash")).toBe("undeposited");
    expect(roleOf("Visa")).toBe("undeposited");
    expect(roleOf("Gift card")).toBe("tender-gift-card");
    expect(roleOf("On account")).toBe("tender-customer-credit");
    // `Used credit` gets NO account of its own — it maps to the reserved
    // Second-hand purchases account, which is the one place d21 and the
    // lexicon disagreed and the lexicon was right (M-07 d26). What a counter
    // buy debits is the goods; what the customer is owed for them is a
    // separate tender on the same Sale.
    expect(roleOf("Used credit")).toBeUndefined();
    expect(roleOf("Pay-out")).toBe("tender-payout");
  });

  it("puts a payout in the expenses band and a redemption in liabilities (d21)", () => {
    const mixed: Seams = {
      ...seams,
      tenders: [tender("t-pay", "Pay-out", "Pay-out"), tender("t-gift", "Gift card", "Gift Card")],
    };
    const { accounts } = buildChart(mixed);
    const band = (n: string) => Math.floor(Number(n) / 1000);

    expect(band(accounts.find((a) => a.role === "tender-payout")!.number)).toBe(6);
    expect(band(accounts.find((a) => a.role === "tender-gift-card")!.number)).toBe(2);
  });

  it("detects the system-written rounding tender, which this prototype models as Cash", () => {
    // architecture section 5 gives `rounding` its own behavior; the prototype
    // carries it as a Cash tender with systemOwned. The divergence is the
    // prototype's, so it is detected rather than worked around silently.
    const rounding = { id: "t-round", name: "Cash rounding", behavior: "Cash", active: true, systemOwned: true } as TenderRow;
    const { accounts } = buildChart({ ...seams, tenders: [rounding] });

    expect(accounts.find((a) => a.name.endsWith("— Cash rounding"))?.role).toBe("tender-rounding");
  });

  it("gives every tax type TWO accounts, collected and paid (d5)", () => {
    const { accounts } = buildChart(seams);

    expect(accounts.filter((a) => a.role === "tax-collected").map((a) => a.name)).toEqual([
      "GST collected",
      "QST collected",
    ]);
    expect(accounts.filter((a) => a.role === "tax-paid").map((a) => a.name)).toEqual([
      "GST paid (ITC)",
      "QST paid (ITC)",
    ]);
  });

  it("gives every E-04 reason code its own account (d6)", () => {
    const { accounts } = buildChart(seams);
    const adj = accounts.filter((a) => a.role === "adjustment");

    expect(adj).toHaveLength(ADJUSTMENT_REASONS.length);
    expect(adj[0].name).toBe("Inventory adjustment — Shrinkage");
  });
});

describe("M-07 d1/d3 — what the reserved accounts are, and whose numbers they carry", () => {
  it("carries no Net Profit and no Current Profits, which are derived and never posted", () => {
    // Two-thirds of the wish list this flow was proposed with still does not
    // survive — M-08 d24 derives both when a statement is drawn, so neither is
    // an account. M-08 d13 is corrected by d31 for the same reason: there is
    // nothing to type into.
    const { accounts } = buildChart(seams);
    const names = accounts.map((a) => a.name.toLowerCase()).join(" | ");

    expect(names).not.toMatch(/net profit|current profits/);
  });

  // M-07 d31 — the third of the wish list DOES survive, because d27 reversed
  // the grounds. M-08 d17's year-end seal posts to retained earnings, so the
  // software must resolve it, which is d3's test for a reserved role.
  it("carries Retained Earnings, because the year-end seal posts to it (d31)", () => {
    const { accounts } = buildChart(seams);

    // Widened deliberately: `GLRole` does not carry the role yet, and this
    // assertion is about the CHART lacking the account, not about the type
    // lacking the member. A `tsc` error here would break the build rather than
    // report a non-conformance.
    expect(accounts.find((a) => (a.role as string) === "retained-earnings")).toBeDefined();
  });

  it("carries a Suspense account, because d10 needs somewhere for a defect to go", () => {
    const { accounts } = buildChart(seams);

    expect(accounts.find((a) => a.role === "suspense")).toBeDefined();
  });

  it("carries a bank account as an ordinary account with a role (A-65)", () => {
    // Not an entity, and no balance is held for it.
    const { accounts } = buildChart(seams);

    expect(accounts.find((a) => a.role === "bank")?.name).toBe("Chequing");
  });

  it("gives every reserved role exactly one account", () => {
    const { accounts } = buildChart(seams);
    const reserved = accounts.filter(
      (a) => a.role && !["revenue", "undeposited", "tax-collected", "tax-paid", "adjustment"].includes(a.role),
    );

    expect(new Set(reserved.map((a) => a.role)).size).toBe(reserved.length);
  });
});

describe("M-07 step 5 — an account can be read back to what posts to it", () => {
  it("names the seam behind an account", () => {
    const { accounts, mappings } = buildChart(seams);
    const visa = accounts.find((a) => a.name.includes("Visa"))!;

    expect(seamsFor(visa.id, mappings, seams)).toEqual(["Visa"]);
  });

  // M-07 d29 — a revenue Section resolves by RULE, so it has no mapping row and
  // the Sales account cannot be read back to a list of Sections. The breakdown
  // lives on the line's section dimension (M-08 d2), not in the chart.
  it("does not name a revenue Section behind the Sales account (d29)", () => {
    const { accounts, mappings } = buildChart(seams);
    const sales = accounts.find((a) => a.role === "revenue")!;

    expect(seamsFor(sales.id, mappings, seams)).toEqual([]);
  });

  it("still names a NON-revenue Section behind its account (d29)", () => {
    const withGc = { ...seams, sections: [...seams.sections, section("GC", "GIFT CARDS", false)] };
    const { accounts, mappings } = buildChart(withGc);
    const mapped = mappings.find((m) => m.seamKind === "section" && m.seamId === "GC")!;

    expect(seamsFor(mapped.accountId, mappings, withGc)).toContain("GIFT CARDS");
    expect(accounts.find((a) => a.id === mapped.accountId)).toBeDefined();
  });

  it("names both seams when two are pointed at one account", () => {
    // Step 5 lets a Manager collapse two seams onto one account; the screen has
    // to be able to say so, or the collapse is invisible. Shown on TENDERS,
    // which still map totally (M-06 d22) — d29 makes collapsing two Sections a
    // reporting choice rather than a mapping one, so Sections can no longer
    // demonstrate this.
    const { accounts, mappings } = buildChart(seams);
    const visa = accounts.find((a) => a.name.includes("Visa"))!;
    const merged = mappings.map((m) =>
      m.seamKind === "tender" && (m.seamId === "t-visa" || m.seamId === "t-amex")
        ? { ...m, accountId: visa.id }
        : m,
    );

    expect(seamsFor(visa.id, merged, seams)).toEqual(["Visa", "Amex"]);
  });

  it("names a tax mapping by which half it is", () => {
    const { accounts, mappings } = buildChart(seams);
    const paid = accounts.find((a) => a.name === "GST paid (ITC)")!;

    expect(seamsFor(paid.id, mappings, seams)).toEqual(["GST paid"]);
  });
});

describe("M-07 — the suggested numbering groups by account type, not by subject", () => {
  const band = (n: string) => Math.floor(Number(n) / 1000);

  it("puts a tax type's two halves in different bands, which is d5 made visible", () => {
    // Collected is a liability; paid is an Input Tax Credit and therefore a
    // receivable (E-02 d34). A subject-based scheme would file both under "tax"
    // and hide that they are opposite sides of the balance sheet.
    const { accounts } = buildChart(seams);
    const collected = accounts.find((a) => a.name === "GST collected")!;
    const paid = accounts.find((a) => a.name === "GST paid (ITC)")!;

    expect(band(paid.number)).toBe(1); // asset
    expect(band(collected.number)).toBe(2); // liability
  });

  // M-07 d31 — d27 reversed d1's no-equity claim and the 3000s fill. Retained
  // earnings and owner's equity are both reserved roles; an accountant seeing
  // an empty 3000s band would now be reading a chart that is missing something.
  it("files equity in the 3000s, because d27 reversed d1's no-equity claim (d31)", () => {
    const { accounts } = buildChart(seams);
    const equity = accounts.filter((a) => band(a.number) === 3);

    expect(equity.length).toBeGreaterThan(0);
    expect(equity.every((a) => accountType(a) === "equity")).toBe(true);
  });

  it("files revenue in the 4000s and cost of goods in the 5000s", () => {
    const { accounts } = buildChart(seams);

    expect(accounts.filter((a) => a.role === "revenue").every((a) => band(a.number) === 4)).toBe(true);
    expect(accounts.filter((a) => a.role === "adjustment").every((a) => band(a.number) === 5)).toBe(true);
  });

  it("gives every account a distinct suggested number", () => {
    // They are the store's to change (d3), but shipping a collision would make
    // the first thing a Manager does be fixing ours.
    const { accounts } = buildChart(seams);

    expect(new Set(accounts.map((a) => a.number)).size).toBe(accounts.length);
  });
});

describe("M-07 d22 — an account's type is derived from its role", () => {
  it("derives a type for every role, so nothing needs one stored beside it", () => {
    // A stored type beside a role is the second copy of a fact, which A-36,
    // A-37 and A-33b each refused. This is the check that it is never needed.
    const { accounts } = buildChart(seams);

    expect(accounts.every((a) => accountType(a) !== undefined)).toBe(true);
  });

  it("does not read the number, so renumbering cannot scramble the grouping", () => {
    // d3 makes the number the store's, and renumbering to match an accountant's
    // chart is the first thing a Manager is invited to do.
    const { accounts } = buildChart(seams);
    const inventory = accounts.find((a) => a.role === "inventory")!;
    const renumbered = { ...inventory, number: "7742" };

    expect(accountType(renumbered)).toBe("asset");
  });

  it("puts a tax type's halves on opposite sides by TYPE, not by band", () => {
    const { accounts } = buildChart(seams);

    expect(accountType(accounts.find((a) => a.name === "GST paid (ITC)")!)).toBe("asset");
    expect(accountType(accounts.find((a) => a.name === "GST collected")!)).toBe("liability");
  });

  it("reads the stored type for an account the Manager added, which has no role", () => {
    const added = { id: "gl-x", number: "6300", name: "Rent", type: "expense" as const, active: true };

    expect(accountType(added)).toBe("expense");
  });

  it("has nothing to say about an added account with no type", () => {
    // Undefined rather than a guess: nothing but the Manager knows.
    const added = { id: "gl-y", number: "6400", name: "Mystery", active: true };

    expect(accountType(added)).toBeUndefined();
  });
});
