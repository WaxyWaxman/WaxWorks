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
 * **The 3000s carry equity (d31).** They were empty on purpose while d1 held
 * no balances and ran no period close — d27 reverses that, and M-08 d17's
 * year-end seal posts into them. What is still absent is *Net Profit* and
 * *Current Profits*, which M-08 d24 derives when a statement is drawn and
 * never posts, so neither is an account here.
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
  // d31 / M-08 d7 — the paper-era lump, and it must be a DIFFERENT account from
  // the one above. `accounts-payable` IS M-05's balance, exactly and
  // permanently, and that invariant is checkable on day one only because the
  // debts the shop carried in from paper never touch it. Typed once at
  // migration and drawn down by hand until it is empty, then dead weight.
  { role: "accounts-payable-opening", number: "2110", name: "Accounts payable — opening" },
  { role: "gift-card-liability", number: "2200", name: "Gift card liability" },
  { role: "customer-credit", number: "2300", name: "Customer account credit" },
  // d28 — ONE Sales account, superseding d6's one-per-Section grain. The
  // Section rides on the line as a dimension (M-08 d2), so totalling sales
  // across every Section and within one are the same query with a different
  // filter. d6's grain answered the first only by summing accounts.
  { role: "revenue", number: "4100", name: "Sales" },
  // d31 — the 3000s, no longer empty. d27 reversed d1's no-equity claim.
  { role: "owners-equity", number: "3100", name: "Owner's equity" },
  // M-08 d17's year-end seal posts here, and nothing else ever does. M-08 d26
  // also lands the opening position's balancing figure in owner's equity above
  // rather than in an account of its own, so the migration figure and every
  // later draw share one line — d31's accepted consequence.
  { role: "retained-earnings", number: "3200", name: "Retained earnings" },
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
  // M-06 d60 — the difference between what a foreign payable was booked at and
  // what the bank actually took. Kept clear of *Bank charges* (d32, 6480) so
  // this account means RATE MOVEMENT and nothing else: M-06 d62 sends a wire
  // fee to its own document precisely so this one stays readable.
  { role: "exchange-gain-or-loss", number: "6350", name: "Exchange gain or loss" },
  // d10 — a non-zero balance here is ALWAYS a defect in this system, never a
  // data-entry mistake. 9999 is where a suspense account conventionally sits,
  // and last is the right place for something that should never have a figure.
  { role: "suspense", number: "9999", name: "Suspense" },
];

/**
 * d32 — the starter chart: ordinary expense and non-operating accounts, seeded
 * so that day one does not begin with a Manager inventing one.
 *
 * d11 promised the chart arrives pre-loaded and *"nothing is blank and nothing
 * has to be invented on day one"*, which was true while every account existed
 * to receive an automatic posting. **M-08 Phase 2 makes day one include typing
 * rent**, and a Manager facing an empty expense band has to invent one before
 * they can record it.
 *
 * These carry **no role** (step 3), so nothing resolves to them and nothing
 * posts to them by itself — they exist to be pointed at by a typed posting.
 * They are renameable, renumberable and deactivatable exactly like an account
 * the Manager added, and deactivating the ones a shop does not use is expected
 * to be a Manager's first act rather than their last (d32's accepted
 * consequence: the chart starts grown).
 *
 * **Bank charges is load-bearing rather than decorative** — M-06 d62 sends a
 * bank fee to a typed posting rather than onto a supplier's Invoice, and this
 * is where it goes.
 *
 * *Where this diverges from the reference model, and it is recorded as an open
 * question in M-07 rather than decided here:* Bookmanager reserves 800-999 for
 * revenue and expense **not directly related to sales**, so its P&L separates
 * operating from non-operating. `GLAccountType` has no such member, so interest
 * income files as `income` beside Sales and income tax as `expense` beside
 * rent. A P&L drawn from these cannot tell the two apart.
 */
const STARTER: { number: string; name: string; type: GLAccountType }[] = [
  { number: "4900", name: "Interest income", type: "income" },
  { number: "4910", name: "Gain on disposal of assets", type: "income" },
  { number: "6400", name: "Rent", type: "expense" },
  { number: "6410", name: "Utilities", type: "expense" },
  { number: "6420", name: "Wages and salaries", type: "expense" },
  { number: "6430", name: "Advertising and promotion", type: "expense" },
  { number: "6440", name: "Insurance", type: "expense" },
  { number: "6450", name: "Telephone and internet", type: "expense" },
  { number: "6460", name: "Repairs and maintenance", type: "expense" },
  { number: "6470", name: "Professional fees", type: "expense" },
  // M-06 d62 — where a bank fee lands, kept clear of the exchange gain or loss
  // so that account means rate movement and nothing else.
  { number: "6480", name: "Bank charges", type: "expense" },
  { number: "6500", name: "Interest expense", type: "expense" },
  { number: "6510", name: "Depreciation", type: "expense" },
  { number: "6900", name: "Income tax", type: "expense" },
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
  "accounts-payable-opening": "The paper-era supplier debts, typed once and drawn down by hand (M-08 d7)",
  "retained-earnings": "Where the year-end seal puts the year's result (M-08 d17). Nothing else posts here",
  "owners-equity": "What the owner has put in or drawn out, and the opening position's balancing figure (M-08 d26)",
  "freight-inbound": "Invoice-level freight, never allocated per copy (E-02 d16)",
  "misc-inbound": "Invoice-level misc, never allocated per copy (E-02 d16, d23)",
  "second-hand-purchases": "The counter buy's money side; the intake credits it back",
  "gift-card-liability": "Money received against a future obligation (M-06 d20)",
  "customer-credit": "What the store owes a customer on their account",
  "cash-over-short": "The nickel-rounding tender the system writes (M-06 d26)",
  "exchange-gain-or-loss": "What the bank took, less what a foreign payable was booked at (M-06 d59, d60)",
  "card-processing-fees": "The difference a deposit reveals — derived, never configured",
  suspense: "Where an unbalanced journal's difference goes (d10). Never zero by accident",
  revenue: "Every Section that counts as revenue (d28). The Section rides on the line as a dimension, not as its own account",
  undeposited: "Cash or card taken in, not yet paid out by the bank (d21)",
  "tender-gift-card": "A redemption drawing down the gift card liability (d21)",
  "tender-customer-credit": "Store credit spent or added (d21). A counter buy debits Second-hand purchases instead",
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
  "accounts-payable-opening": "liability",
  "retained-earnings": "equity",
  "owners-equity": "equity",
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
  "exchange-gain-or-loss": "expense",
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
  const add = (role: GLRole | undefined, number: string, name: string, type?: GLAccountType): GLAccount => {
    const a: GLAccount = { id: `gl-${number}-${accounts.length}`, role, number, name, active: true, ...(type ? { type } : {}) };
    accounts.push(a);
    return a;
  };

  for (const r of RESERVED) add(r.role, r.number, r.name);
  // d32 — role-less, so they carry a STORED type: d22 derives a type from a
  // role and these have none, which is the same case as an account the Manager
  // added at step 3. Nothing posts to them by itself.
  for (const a of STARTER) add(undefined, a.number, a.name, a.type);

  // d6 — revenue is one account per Section, because M-06 d28 already gives
  // every Section a code and a sort order, and a single `Sales` account would
  // discard a breakdown the shop curates and M-03 already reports.
  // d28, d29, d33 — a Section resolves by RULE wherever a rule exists, and the
  // seam is therefore SPARSE. A Section that counts as revenue resolves to the
  // reserved Sales account above. The system-owned gift-card Section resolves
  // to `gift-card-liability`, which is what closeJournal has always done while
  // bypassing this mapping. Only a Section a MANAGER creates and marks
  // not-revenue is left with nothing to resolve by, and that is the one case a
  // mapping was ever for — its target must be a LIABILITY (d33), because
  // "money received against a future obligation" is not revenue (M-06 d20).
  //
  // Nothing is seeded here: the only non-revenue Section that ships is
  // system-owned and rule-resolved.

  // M-06 d22 — per TENDER, not per behavior: Visa and Amex settle as separate
  // deposits, and a merged figure cannot be tied back to a bank statement.
  //
  // d21 — but the KIND follows the behavior. d22's reason is about deposits and
  // does not reach a gift card redemption, where no money moves at all; five of
  // the seven behaviors are not assets, and putting them all in "undeposited
  // funds" is what building this screen made visible.
  const seen: Record<string, number> = {};
  const secondHand = accounts.find((a) => a.role === "second-hand-purchases")!;
  seams.tenders.forEach((tn) => {
    // `Used Credit` is the one tender that does not get an account of its own:
    // it maps to the RESERVED Second-hand purchases account.
    //
    // d21 grouped it with `store_credit` under a customer account credit, on
    // the grounds that both touch a Customer's balance. The lexicon §14 has
    // always said otherwise — *"the `Used Credit` tender debits it"* — and the
    // lexicon is right, because what a counter buy DEBITS is the goods. What
    // the customer is owed for them is the other side, and the till already
    // records it as its own tender: store credit through `Account Balance`, or
    // cash. Posting the customer's side here as well would count it twice, and
    // a mixed Sale — trade in $20, buy $36.20, pay $16.20 — stops balancing.
    //
    // Two seams pointing at one account is expressly allowed (step 5).
    if (tn.behavior === "Used Credit") {
      mappings.push({ seamKind: "tender", seamId: tn.id, accountId: secondHand.id });
      return;
    }
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
  // d29, d33 — the Section seam is SPARSE, so absence is not a hole. A revenue
  // Section resolves to the Sales role and a system-owned one to the liability
  // its kind names; neither has a mapping row to leave null. Only a Section a
  // Manager created and marked not-revenue needs one, and only that case can
  // still be genuinely unmapped.
  for (const s of seams.sections) {
    if (s.countsAsRevenue || s.systemOwned) continue;
    if (!has("section", s.code)) missing.push(`Section ${s.name}`);
  }
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
