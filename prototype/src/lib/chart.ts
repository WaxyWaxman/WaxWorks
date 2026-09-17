import type {
  GLAccount,
  GLAccountType,
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

/**
 * The suggested numbering, grouped by ACCOUNT TYPE:
 *
 *     1000s assets · 2000s liabilities · 3000s equity · 4000s revenue
 *     5000s cost of goods · 6000s expenses · 9999 suspense
 *
 * Grouped by type rather than by subject, because a subject cuts across the
 * balance sheet and a type does not: tax is one subject and TWO types — GST
 * collected is a liability at 2400 and GST paid is an Input Tax Credit at 1300
 * (d5, E-02 d34) — and a tender is one subject and three, since `payout` is an
 * expense and `rounding` is income or expense (M-06).
 *
 * **3000s stays empty on purpose.** d1 runs no period close and holds no
 * equity, so an accountant seeing no 3000s knows at once that this file does
 * not carry it. Renumbering to hide the gap would hide the fact.
 *
 * Suggestions only. d3 makes the number the store's the moment it opens the
 * screen, and nothing resolves an account by it — the reserved accounts resolve
 * by `role`, the per-seam ones through a GLMapping. Which is also why the
 * grouping cannot be relied on to tell a destination what TYPE an account is:
 * a shop that renumbers would silently change what an inferred type said, and
 * M-07 carries that as an open question against d15's export.
 */
const RESERVED: { role: GLRole; number: string; name: string }[] = [
  { role: "bank", number: "1010", name: "Chequing" },
  { role: "inventory", number: "1200", name: "Inventory" },
  { role: "accounts-payable", number: "2100", name: "Accounts payable" },
  { role: "gift-card-liability", number: "2200", name: "Gift card liability" },
  { role: "customer-credit", number: "2300", name: "Customer account credit" },
  { role: "cogs", number: "5100", name: "Cost of goods" },
  { role: "freight-inbound", number: "5200", name: "Freight inbound" },
  // d23 — its own account rather than folded into freight. A-29 puts both in
  // cost of goods and the formula treats them alike, but the paperwork does
  // not: E-02 step 6 has them entered as two figures, and a misc charge is a
  // restocking fee or a pallet deposit as often as it is carriage.
  { role: "misc-inbound", number: "5250", name: "Miscellaneous — inbound" },
  { role: "second-hand-purchases", number: "5300", name: "Second-hand purchases" },
  { role: "card-processing-fees", number: "6100", name: "Card processing fees" },
  { role: "cash-over-short", number: "6200", name: "Cash over / short" },
  // d10 — a non-zero balance here is ALWAYS a defect in this system, never a
  // data-entry mistake. 9999 is where a suspense account conventionally sits,
  // and last is the right place for something that should never have a figure.
  { role: "suspense", number: "9999", name: "Suspense" },
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
  "misc-inbound": "Invoice-level misc, never allocated per copy (E-02 d16, d23)",
  "second-hand-purchases": "The counter buy's money side; the intake credits it back",
  "gift-card-liability": "Money received against a future obligation (M-06 d20)",
  "customer-credit": "What the store owes a customer on their account",
  "cash-over-short": "The nickel-rounding tender the system writes (M-06 d26)",
  "card-processing-fees": "The difference a deposit reveals — derived, never configured",
  suspense: "Where an unbalanced journal's difference goes (d10). Never zero by accident",
  revenue: "One per Section (d6) — M-06 d20 says which Sections are revenue at all",
  undeposited: "Cash or card taken in, not yet paid out by the bank (d21)",
  "tender-gift-card": "A redemption drawing down the gift card liability (d21)",
  "tender-customer-credit": "Store credit spent, or a counter buy creating it (d21)",
  "tender-payout": "Cash out of the till for an expense (M-06, d21)",
  "tender-rounding": "The nickel difference the system writes (M-06 d26, d21)",
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
/**
 * d21 — which kind of account a tender's behavior implies.
 *
 * `rounding` is the awkward one: architecture section 5 gives it its own
 * behavior in the enum, and this prototype models it as a `Cash` tender carrying
 * `systemOwned` instead (M-06 d26 — written by the system, never a button). The
 * divergence is the prototype's, not the specification's, so it is detected
 * here rather than worked around silently.
 */
function tenderAccount(tn: TenderRow): { role: GLRole; base: number; prefix: string } {
  if (tn.systemOwned && tn.behavior === "Cash")
    return { role: "tender-rounding", base: 6210, prefix: "Cash over / short" };
  switch (tn.behavior) {
    case "Gift Card":
      return { role: "tender-gift-card", base: 2210, prefix: "Gift card liability" };
    case "Account Balance":
    case "Used Credit":
      return { role: "tender-customer-credit", base: 2310, prefix: "Customer account credit" };
    case "Pay-out":
      return { role: "tender-payout", base: 6300, prefix: "Pay-out" };
    default:
      // Cash and Credit Card — the two that actually produce a deposit.
      return { role: "undeposited", base: 1100, prefix: "Undeposited funds" };
  }
}

/**
 * M-07 d22 — every role implies exactly one type, so the type is derived and
 * never stored beside the role.
 *
 * `suspense` is the one judgement call: a suspense account is conventionally an
 * asset, and its whole point is that it should never hold anything.
 */
const TYPE_FOR_ROLE: Record<GLRole, GLAccountType> = {
  bank: "asset",
  inventory: "asset",
  undeposited: "asset",
  "tax-paid": "asset",
  suspense: "asset",
  "accounts-payable": "liability",
  "gift-card-liability": "liability",
  "customer-credit": "liability",
  "tax-collected": "liability",
  "tender-gift-card": "liability",
  "tender-customer-credit": "liability",
  revenue: "income",
  cogs: "cogs",
  "freight-inbound": "cogs",
  "misc-inbound": "cogs",
  "second-hand-purchases": "cogs",
  adjustment: "cogs",
  "card-processing-fees": "expense",
  "cash-over-short": "expense",
  "tender-payout": "expense",
  "tender-rounding": "expense",
};

/**
 * d22 — an account's type. From its role where it has one; from the stored
 * field where the Manager added it, which is the only case nothing else knows.
 *
 * Deliberately NOT from the number: d3 makes the number the store's, and
 * renumbering to match an accountant's chart is the first thing a Manager is
 * invited to do.
 */
export const accountType = (a: GLAccount): GLAccountType | undefined =>
  a.role ? TYPE_FOR_ROLE[a.role] : a.type;

export const TYPE_LABEL: Record<GLAccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Revenue",
  cogs: "Cost of goods",
  expense: "Expenses",
};

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
    const a = add("revenue", String(4100 + i * 10), `Sales — ${s.name}`);
    // M-06 d28 — a Section is keyed by its two-character code, not an id.
    mappings.push({ seamKind: "section", seamId: s.code, accountId: a.id });
  });

  // M-06 d22 — per TENDER, not per behavior: Visa and Amex settle as separate
  // deposits, and a merged figure cannot be tied back to a bank statement.
  //
  // d21 — but the KIND follows the behavior. d22's reason is about deposits and
  // does not reach a gift card redemption, where no money moves at all; five of
  // the seven behaviors are not assets, and putting them all in "undeposited
  // funds" is what building this screen made visible.
  const seen: Record<string, number> = {};
  seams.tenders.forEach((tn) => {
    const spec = tenderAccount(tn);
    const n = (seen[spec.role] = (seen[spec.role] ?? 0) + 1);
    const a = add(spec.role, String(spec.base + (n - 1) * 10), `${spec.prefix} — ${tn.name}`);
    mappings.push({ seamKind: "tender", seamId: tn.id, accountId: a.id });
  });

  // d5 — TWO per tax type. Netting them would merge an asset and a liability in
  // one row, which the export's destination will refuse.
  seams.taxTypes.forEach((tx, i) => {
    // The two halves land in different THOUSANDS, which is d5 made visible: a
    // liability at 2400 and a receivable at 1300, not neighbours in one block.
    const collected = add("tax-collected", String(2400 + i * 10), `${tx.name} collected`);
    const paid = add("tax-paid", String(1300 + i * 10), `${tx.name} paid (ITC)`);
    mappings.push({ seamKind: "tax-collected", seamId: tx.code, accountId: collected.id });
    mappings.push({ seamKind: "tax-paid", seamId: tx.code, accountId: paid.id });
  });

  // d6 — one per E-04 reason code.
  ADJUSTMENT_REASONS.forEach((reason, i) => {
    const a = add("adjustment", String(5400 + i * 10), `Inventory adjustment — ${reason}`);
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
