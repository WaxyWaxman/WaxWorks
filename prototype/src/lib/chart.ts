import type {
  GLAccount,
  GLMapping,
  GLRole,
  SectionRow,
  TaxType,
  TenderRow,
} from "../data/types";
import { ADJUSTMENT_REASONS } from "../data/types";

/**
 * M-07 — building the chart, and mapping the seams onto it.
 *
 * d11: setup creates and maps an account for EVERY seam before the Manager
 * sees the screen, so nothing can be left unmapped. That is what makes d10's
 * Suspense a defect rather than a configuration hole — an unmapped seam would
 * otherwise be discovered at the close, which is the worst possible moment.
 *
 * d3: the numbers and names below are SUGGESTIONS. They belong to the store the
 * moment it opens the screen, and nothing in this system ever resolves an
 * account by its number — resolution is by `role` for the reserved accounts and
 * by a GLMapping for the per-seam ones.
 */

/** The reserved roles, with a suggested number and name for each. */
const RESERVED: { role: GLRole; number: string; name: string }[] = [
  { role: "bank", number: "110", name: "Chequing" },
  { role: "inventory", number: "200", name: "Inventory" },
  { role: "accounts-payable", number: "300", name: "Accounts payable" },
  { role: "gift-card-liability", number: "310", name: "Gift card liability" },
  { role: "customer-credit", number: "320", name: "Customer account credit" },
  { role: "cogs", number: "500", name: "Cost of goods" },
  { role: "freight-inbound", number: "510", name: "Freight inbound" },
  { role: "second-hand-purchases", number: "520", name: "Second-hand purchases" },
  { role: "cash-over-short", number: "705", name: "Cash over / short" },
  { role: "card-processing-fees", number: "710", name: "Card processing fees" },
  // d10 — a non-zero balance here is ALWAYS a defect in this system, never a
  // data-entry mistake. It sits last on purpose.
  { role: "suspense", number: "999", name: "Suspense" },
];

/**
 * What each role is for, in one line, shown beside it so the Manager can see
 * what the software will put there before renaming it (step 2).
 */
export const ROLE_PURPOSE: Record<GLRole, string> = {
  bank: "Where a settlement's money leaves from, and a deposit lands (A-65)",
  inventory: "A copy's own cost, in until it sells (d2 — perpetual)",
  cogs: "That same cost, out at the moment it sells (d2)",
  "accounts-payable": "What is owed a supplier, from finalize (d13)",
  "freight-inbound": "Invoice-level freight, never allocated per copy (E-02 d16)",
  "second-hand-purchases": "The counter buy's money side; the intake credits it back",
  "gift-card-liability": "Money received against a future obligation (M-06 d20)",
  "customer-credit": "What the store owes a customer on their account",
  "cash-over-short": "The nickel-rounding tender the system writes (M-06 d26)",
  "card-processing-fees": "The difference a deposit reveals — derived, never configured",
  suspense: "Where an unbalanced journal's difference goes (d10). Never zero by accident",
  revenue: "One per Section (d6) — M-06 d20 says which Sections are revenue at all",
  undeposited: "One per tender (M-06 d22) — taken in, not yet paid out by the bank",
  "tax-collected": "Charged on a Sale. A liability (d5)",
  "tax-paid": "Paid on a supplier Invoice. An Input Tax Credit, a receivable (E-02 d34)",
  adjustment: "One per E-04 reason code (d6) — the six exist so a Manager must choose",
};

export interface Seams {
  sections: SectionRow[];
  tenders: TenderRow[];
  taxTypes: TaxType[];
}

export interface BuiltChart {
  accounts: GLAccount[];
  mappings: GLMapping[];
}

/**
 * d11 — every seam gets an account and a mapping, before anyone looks at it.
 *
 * The starting chart therefore mirrors this system's data model rather than an
 * accountant's habits: a shop with twelve Sections gets twelve revenue
 * accounts, and `Visa`, `Mastercard` and `Amex` arrive as three separate asset
 * accounts — correct per M-06 d22, and startling on first sight. d3's editable
 * numbers and names are what make that survivable.
 */
export function buildChart(seams: Seams): BuiltChart {
  const accounts: GLAccount[] = [];
  const mappings: GLMapping[] = [];
  const add = (role: GLRole | undefined, number: string, name: string): GLAccount => {
    const a: GLAccount = { id: `gl-${number}-${accounts.length}`, role, number, name, active: true };
    accounts.push(a);
    return a;
  };

  for (const r of RESERVED) add(r.role, r.number, r.name);

  // d6 — revenue is one account per Section, because M-06 d28 already gives
  // every Section a code and a sort order, and a single `Sales` account would
  // discard a breakdown the shop curates and M-03 already reports.
  seams.sections.forEach((s, i) => {
    const a = add("revenue", String(400 + i * 10), `Sales — ${s.name}`);
    // M-06 d28 — a Section is keyed by its two-character code, not an id.
    mappings.push({ seamKind: "section", seamId: s.code, accountId: a.id });
  });

  // M-06 d22 — per TENDER, not per behavior: Visa and Amex settle as separate
  // deposits, and a merged figure cannot be tied back to a bank statement.
  seams.tenders.forEach((t, i) => {
    const a = add("undeposited", String(120 + i), `Undeposited funds — ${t.name}`);
    mappings.push({ seamKind: "tender", seamId: t.id, accountId: a.id });
  });

  // d5 — TWO per tax type. Netting them would merge an asset and a liability in
  // one row, which the export's destination will refuse.
  seams.taxTypes.forEach((tx, i) => {
    const collected = add("tax-collected", String(800 + i * 10), `${tx.name} collected`);
    const paid = add("tax-paid", String(805 + i * 10), `${tx.name} paid (ITC)`);
    mappings.push({ seamKind: "tax-collected", seamId: tx.code, accountId: collected.id });
    mappings.push({ seamKind: "tax-paid", seamId: tx.code, accountId: paid.id });
  });

  // d6 — one per E-04 reason code.
  ADJUSTMENT_REASONS.forEach((reason, i) => {
    const a = add("adjustment", String(530 + i), `Inventory adjustment — ${reason}`);
    mappings.push({ seamKind: "adjustment", seamId: reason, accountId: a.id });
  });

  return { accounts, mappings };
}

/** d11's invariant: every seam resolves. An unmapped one is a defect, not a blank. */
export function unmappedSeams(seams: Seams, mappings: GLMapping[]): string[] {
  const has = (kind: GLMapping["seamKind"], id: string) =>
    mappings.some((m) => m.seamKind === kind && m.seamId === id);
  const missing: string[] = [];
  for (const s of seams.sections) if (!has("section", s.code)) missing.push(`Section ${s.name}`);
  for (const t of seams.tenders) if (!has("tender", t.id)) missing.push(`Tender ${t.name}`);
  for (const tx of seams.taxTypes) {
    if (!has("tax-collected", tx.code)) missing.push(`${tx.name} collected`);
    if (!has("tax-paid", tx.code)) missing.push(`${tx.name} paid`);
  }
  for (const r of ADJUSTMENT_REASONS) if (!has("adjustment", r)) missing.push(`Adjustment — ${r}`);
  return missing;
}

/** What posts to this account, for the review screen (step 5). */
export function seamsFor(accountId: string, mappings: GLMapping[], seams: Seams): string[] {
  return mappings
    .filter((m) => m.accountId === accountId)
    .map((m) => {
      if (m.seamKind === "section") return seams.sections.find((s) => s.code === m.seamId)?.name ?? m.seamId;
      if (m.seamKind === "tender") return seams.tenders.find((t) => t.id === m.seamId)?.name ?? m.seamId;
      if (m.seamKind === "adjustment") return m.seamId;
      const tx = seams.taxTypes.find((t) => t.code === m.seamId);
      return `${tx?.name ?? m.seamId} ${m.seamKind === "tax-collected" ? "collected" : "paid"}`;
    });
}
