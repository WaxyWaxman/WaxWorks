import type {
  GLAccount,
  JournalBatch,
  JournalLine,
  LedgerPeriodSeal,
  LedgerPeriodUnseal,
} from "../data/types";
import { accountType } from "./chart";
import { assembleJournal, type Posting } from "./journal";
import { activityBetween, linesIn, recomputeAsAt, totalOf, type BalanceFilter } from "./ledgerBalances";
import { fiscalYearEndFor, isSealed, isYearEnd, periodEnd, periodOf, periodStart } from "./ledgerPeriods";
import type { ReconciliationReport } from "./ledgerReconciliation";

/**
 * M-08 Phase 4 — the statements, and what issuing one leaves behind.
 *
 * Four decisions and one architecture decision shape it:
 *
 *   d23  — **the P&L has a bottom line and it is called a profit.** M-07 d27
 *          retired the prohibition and this flow is what earned it: Phase 2's
 *          typed postings bring in rent, utilities, loans, depreciation, draws
 *          and tax — the groups whose absence made the figure wrong.
 *   d24  — **current earnings is derived when a statement is drawn, never
 *          posted.** Only the year-end seal posts (d17).
 *   d30  — **only lines dated on or before the as-at date**, and every
 *          statement answers the same way.
 *   d31  — **issuing stores the FIGURES**, not a rendered file, and re-opening
 *          an issuance shows what was issued and never a recomputation.
 *   A-77 — an issuance is a **discriminated union**, and the `filed` mark is
 *          deliberately not one of its kinds.
 *
 *   d36  — a statement over any unsealed period is **provisional**, and the
 *          mark is **stored on the issuance**, never rendered from the period's
 *          state. Nothing is printed on the sealed side.
 */

const cents = (n: number): number => Math.round(n * 100);
const dollars = (c: number): number => c / 100;

// ---------------------------------------------------------------------------
// What every statement carries
// ---------------------------------------------------------------------------

/**
 * d30's second half, which is not optional decoration.
 *
 * *"The ledger can hold money no statement shows. The sum of every journal line
 * and the balance sheet stop being the same number whenever a future-dated
 * posting exists, which reads as a discrepancy to anyone who checks one against
 * the other — so a statement has to be able to say that lines after its date
 * exist, without including them."*
 */
export interface LaterLines {
  count: number;
  /** The earliest date beyond the statement, so the note can be specific. */
  firstDate?: string;
}

function laterThan(batches: JournalBatch[], asAt: string, filter: BalanceFilter = {}): LaterLines {
  const after = linesIn(batches)
    .filter((l) => l.businessDate > asAt)
    .filter(
      (l) =>
        (filter.accountId === undefined || l.accountId === filter.accountId) &&
        (filter.section === undefined || l.section === filter.section) &&
        (filter.location === undefined || l.location === filter.location),
    )
    .map((l) => l.businessDate)
    .sort();
  return { count: after.length, ...(after.length > 0 ? { firstDate: after[0] } : {}) };
}

/** One grouped line on a statement: an account and what it came to. */
export interface StatementLine {
  accountId: string;
  name: string;
  /** Stated as a positive figure the way the statement reads it. */
  amount: number;
}

// ---------------------------------------------------------------------------
// The Profit & Loss
// ---------------------------------------------------------------------------

export interface ProfitAndLoss {
  /** d9 — *"every statement states the period it covers"*, because the first
   *  fiscal year is a stub and a short year must not read as a bad one. */
  from: string;
  to: string;
  revenue: StatementLine[];
  costOfGoods: StatementLine[];
  expenses: StatementLine[];
  totalRevenue: number;
  totalCostOfGoods: number;
  totalExpenses: number;
  /** d23 — the bottom line, and it is called a **profit**. */
  profit: number;
  /** Whether every period the range covers is sealed. See the module note. */
  periodSealed: boolean;
  later: LaterLines;
}

/**
 * A P&L for a date range.
 *
 * Revenue accounts carry credit balances, which are negative in the ledger's
 * signed convention, so they are **negated to be read**. Cost of goods and
 * expenses carry debit balances and are read as they are. The profit is
 * revenue less both, which is the same thing as negating the sum of every P&L
 * account's signed balance — computed that way so one arithmetic mistake
 * cannot make the components and the bottom line disagree.
 */
export function profitAndLoss(
  from: string,
  to: string,
  accounts: GLAccount[],
  batches: JournalBatch[],
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  filter: BalanceFilter = {},
): ProfitAndLoss {
  const rows = activityBetween(batches, from, to, filter);

  const byType = (want: "income" | "cogs" | "expense"): StatementLine[] => {
    const out = new Map<string, number>();
    for (const r of rows) {
      const account = accounts.find((a) => a.id === r.accountId);
      if (!account || accountType(account) !== want) continue;
      out.set(r.accountId, (out.get(r.accountId) ?? 0) + cents(r.balance));
    }
    return [...out.entries()]
      .filter(([, c]) => c !== 0)
      .map(([accountId, c]) => ({
        accountId,
        name: accounts.find((a) => a.id === accountId)?.name ?? accountId,
        // Revenue reads positive; it is a credit balance underneath.
        amount: dollars(want === "income" ? -c : c),
      }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId));
  };

  const revenue = byType("income");
  const costOfGoods = byType("cogs");
  const expenses = byType("expense");

  const sum = (ls: StatementLine[]) => dollars(ls.reduce((s, l) => s + cents(l.amount), 0));
  const totalRevenue = sum(revenue);
  const totalCostOfGoods = sum(costOfGoods);
  const totalExpenses = sum(expenses);

  return {
    from,
    to,
    revenue,
    costOfGoods,
    expenses,
    totalRevenue,
    totalCostOfGoods,
    totalExpenses,
    profit: dollars(cents(totalRevenue) - cents(totalCostOfGoods) - cents(totalExpenses)),
    periodSealed: everyPeriodSealed(from, to, seals, unseals),
    later: laterThan(batches, to, filter),
  };
}

function everyPeriodSealed(
  from: string,
  to: string,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): boolean {
  for (let p = periodOf(from); p <= periodOf(to); ) {
    if (!isSealed(p, seals, unseals)) return false;
    const [y, m] = p.split("-").map(Number);
    p = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The Balance Sheet
// ---------------------------------------------------------------------------

/**
 * E-07 d21 — each Customer's signed balance, so the statement can classify.
 *
 * **The ledger alone cannot satisfy E-07 d21, and this is why it is an input.**
 * The chart holds one `customer-credit` account carrying the NET of every
 * Customer, and d21's whole point is that netting is the defect: *"A customer
 * at +$200 and another at −$300 sum to −$100, which belongs on no statement;
 * classified by sign they are $200 of liability and $300 of asset, which is the
 * truth."* So a balance sheet drawn from the journal on its own would state the
 * net, and d21 forbids exactly that.
 *
 * Positive is store credit — the shop owes them, a **liability**. Negative is
 * an unpaid customer invoice — they owe the shop, an **asset**.
 */
export type CustomerBalances = number[];

export interface BalanceSheet {
  asAt: string;
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /**
   * d24 — **named as its own line rather than folded into a total.** Between
   * year-end seals, equity as *posted* and equity as *shown* differ by the year
   * to date, which is correct accounting and reads as a discrepancy to anyone
   * comparing the chart against the statement.
   */
  currentEarnings: number;
  /** Assets − (liabilities + equity). Zero, or the statement is wrong. */
  outOfBalance: number;
  periodSealed: boolean;
  later: LaterLines;
}

export function balanceSheet(
  asAt: string,
  accounts: GLAccount[],
  batches: JournalBatch[],
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  yearEndMonth: number,
  customerBalances?: CustomerBalances,
): BalanceSheet {
  const rows = recomputeAsAt(batches, asAt);

  const grouped = new Map<string, number>();
  for (const r of rows) grouped.set(r.accountId, (grouped.get(r.accountId) ?? 0) + cents(r.balance));

  const customerAccount = accounts.find((a) => a.role === "customer-credit");

  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];

  for (const [accountId, c] of grouped) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const type = accountType(account);
    // A P&L account's balance is not on the balance sheet — it is in
    // `currentEarnings` below, derived (d24).
    if (type === "income" || type === "cogs" || type === "expense") continue;
    // E-07 d21 — replaced by the classified pair, where the balances are known.
    if (customerBalances && account.id === customerAccount?.id) continue;

    const row = { accountId, name: account.name, amount: dollars(Math.abs(c)) };
    if (type === "asset") (c >= 0 ? assets : liabilities).push(row);
    else if (type === "liability") (c <= 0 ? liabilities : assets).push(row);
    else if (type === "equity") equity.push({ ...row, amount: dollars(-c) });
  }

  // E-07 d21 — group by sign, total each group, never add the groups together.
  if (customerBalances && customerAccount) {
    const owedToCustomers = customerBalances.filter((b) => b > 0).reduce((s, b) => s + cents(b), 0);
    const owedByCustomers = customerBalances.filter((b) => b < 0).reduce((s, b) => s - cents(b), 0);
    if (owedToCustomers !== 0) {
      liabilities.push({
        accountId: customerAccount.id,
        name: `${customerAccount.name} — store credit`,
        amount: dollars(owedToCustomers),
      });
    }
    if (owedByCustomers !== 0) {
      assets.push({
        accountId: customerAccount.id,
        name: `${customerAccount.name} — owed by customers`,
        amount: dollars(owedByCustomers),
      });
    }
  }

  // d24 — derived at the moment the statement is drawn, by running the P&L for
  // the fiscal year to date. Never posted, nothing accumulating.
  const yearEnd = fiscalYearEndFor(periodOf(asAt), yearEndMonth);
  const yearStart = periodStart(
    (() => {
      const [y, m] = yearEnd.split("-").map(Number);
      return m === 12 ? `${y}-01` : `${y - 1}-${String(m + 1).padStart(2, "0")}`;
    })(),
  );
  const currentEarnings = profitAndLoss(
    yearStart,
    asAt,
    accounts,
    batches,
    seals,
    unseals,
  ).profit;

  const sum = (ls: StatementLine[]) => ls.reduce((s, l) => s + cents(l.amount), 0);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity) + cents(currentEarnings);

  const sortLines = (ls: StatementLine[]) => ls.sort((a, b) => a.accountId.localeCompare(b.accountId));

  return {
    asAt,
    assets: sortLines(assets),
    liabilities: sortLines(liabilities),
    equity: sortLines(equity),
    totalAssets: dollars(totalAssets),
    totalLiabilities: dollars(totalLiabilities),
    totalEquity: dollars(totalEquity),
    currentEarnings,
    outOfBalance: dollars(totalAssets - totalLiabilities - totalEquity),
    periodSealed: isSealed(periodOf(asAt), seals, unseals),
    later: laterThan(batches, asAt),
  };
}

// ---------------------------------------------------------------------------
// A-77, d31 — issuances
// ---------------------------------------------------------------------------

/**
 * A-77 — **the scope is a discriminated union, and an instant is NOT encoded as
 * a degenerate range.**
 *
 * *"Encode an instant as a degenerate range and every balance sheet overlaps
 * every earlier export, so d16's overlap warning — its entire purpose —
 * becomes noise."* The range is **half-open**: `from` inclusive, `toExclusive`
 * exclusive, so two adjacent exports cannot both claim the boundary day.
 */
export type IssuanceScope =
  | { kind: "range"; from: string; toExclusive: string }
  | { kind: "as-at"; at: string };

/**
 * d36 — whether a statement on screen is provisional.
 *
 * Derived here and **only for the live screen**, which is recomputing anyway.
 * An issuance stores its own copy, because a mark a re-opened issuance
 * recomputed would vanish the moment its period sealed — the exact harm d31
 * stores figures to prevent.
 *
 * One-way: a sealed period prints **nothing**. d29 permits an unseal, so
 * *final* is a promise this system cannot keep, and the absence of the word is
 * the absence of a warning rather than a claim (d15's shape).
 */
export const isProvisional = (statement: { periodSealed: boolean }): boolean =>
  !statement.periodSealed;

/**
 * d36 — every variant carries `provisional`, **stored and never recomputed**.
 *
 * It sits on the issuance rather than inside `figures` because it is a property
 * of what LEFT THE BUILDING rather than of the arithmetic, and because A-77's
 * unseal warning reads issuances: *"they hold a copy that said provisional"*
 * and *"they hold a copy that said nothing"* are different situations, and the
 * second is worse.
 */
interface IssuanceBase {
  id: string;
  provisional: boolean;
  issuedAt: string;
  actorInitials: string;
  /** A-74 — `statement_issue` is manager-only. */
  authorizedByInitials: string;
}

export interface JournalExportIssuance extends IssuanceBase {
  kind: "journal-export";
  scope: { kind: "range"; from: string; toExclusive: string };
  /** d31 — the figures, not a rendered file. */
  figures: JournalLine[];
}

export interface ProfitAndLossIssuance extends IssuanceBase {
  kind: "profit-and-loss";
  scope: { kind: "range"; from: string; toExclusive: string };
  figures: ProfitAndLoss;
}

export interface BalanceSheetIssuance extends IssuanceBase {
  kind: "balance-sheet";
  /** A-77 — an as-at INSTANT, never a degenerate range. */
  scope: { kind: "as-at"; at: string };
  figures: BalanceSheet;
}

/**
 * A-77's kinds. **Not interchangeable**, which is the reason for the union:
 * *"an export moves the journal itself and duplicating it corrupts the
 * destination, while a statement asserts a moment and duplicating it corrupts
 * nothing."*
 *
 * The `filed` mark is deliberately **not** here (A-77): nothing is issued when
 * a return is filed, its scope is a period rather than a document, and it is
 * the only one that **refuses** an operation rather than warning about one —
 * and a gate does not belong in a log whose kinds can grow.
 */
export interface ReconciliationReportIssuance extends IssuanceBase {
  kind: "reconciliation-report";
  /** A-77 — an as-at instant, like a balance sheet: it asserts a moment. */
  scope: { kind: "as-at"; at: string };
  figures: ReconciliationReport;
}

export type LedgerIssuance =
  | JournalExportIssuance
  | ProfitAndLossIssuance
  | BalanceSheetIssuance
  | ReconciliationReportIssuance;

interface IssuedBy {
  issuedAt: string;
  actorInitials: string;
  authorizedByInitials: string;
}

/**
 * d31, d36 — the only places an issuance is made, so the provisional mark
 * cannot be forgotten at a call site.
 *
 * Each freezes the figures and the mark together, and nothing constructs an
 * issuance by hand — which is what makes d36's *"stored rather than rendered"*
 * an invariant rather than a habit.
 */
export const issueProfitAndLoss = (
  id: string,
  scope: { kind: "range"; from: string; toExclusive: string },
  figures: ProfitAndLoss,
  by: IssuedBy,
): ProfitAndLossIssuance => ({
  id,
  kind: "profit-and-loss",
  scope,
  ...by,
  figures,
  provisional: isProvisional(figures),
});

/** The scope comes from the figures, so the two can never name different days. */
export const issueBalanceSheet = (
  id: string,
  figures: BalanceSheet,
  by: IssuedBy,
): BalanceSheetIssuance => ({
  id,
  kind: "balance-sheet",
  scope: { kind: "as-at", at: figures.asAt },
  ...by,
  figures,
  provisional: isProvisional(figures),
});

/**
 * A reconciliation report is issued like a balance sheet — an as-at instant,
 * because it asserts a moment rather than moving anything. d25's *"nothing
 * downstream requires it"* holds here too: issuing one gates nothing.
 *
 * Provisional is passed in rather than derived, because a reconciliation report
 * is about an ACCOUNT rather than a period and this module cannot tell which
 * periods it spans without being handed them.
 */
export const issueReconciliationReport = (
  id: string,
  figures: ReconciliationReport,
  provisional: boolean,
  by: IssuedBy,
): ReconciliationReportIssuance => ({
  id,
  kind: "reconciliation-report",
  scope: { kind: "as-at", at: figures.asAt },
  ...by,
  figures,
  provisional,
});

/**
 * d36 for an export. A range is provisional while **any** period it touches is
 * unsealed — an export of an open month can be missing lines that land later,
 * and M-07 d16's *"importing the same journal twice silently doubles the
 * books"* is the same hazard from the other end.
 */
export function issueExport(
  id: string,
  from: string,
  toExclusive: string,
  figures: JournalLine[],
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  by: IssuedBy,
): JournalExportIssuance {
  // The last day actually covered, since `toExclusive` is exclusive.
  const lastDay = dayBeforeOf(toExclusive);
  return {
    id,
    kind: "journal-export",
    scope: { kind: "range", from, toExclusive },
    ...by,
    figures,
    provisional: !everyPeriodSealed(from, lastDay, seals, unseals),
  };
}

const dayBeforeOf = (date: string): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * d31 — re-opening a stored issuance shows **what was issued**, never a
 * recomputation.
 *
 * This looks like it does nothing, and that is the point: *"otherwise the
 * record of what the accountant holds could quietly change, which is the whole
 * reason it is stored."* It exists so that no caller is tempted to re-derive,
 * and so the rule has somewhere to be tested.
 */
export const reopenIssuance = <T extends LedgerIssuance>(issuance: T): T["figures"] =>
  issuance.figures;

/**
 * M-07 d16's overlap warning — **exports against exports, and nothing else.**
 *
 * The purpose is d16's: *"importing the same journal twice silently doubles the
 * books."* Only an export moves the journal, so only an export can double it —
 * A-77's *"duplicating a statement corrupts nothing"* is what keeps a P&L over
 * the same months out of this list. It **warns and never refuses**, on A-28a's
 * terms: a second export of a range is sometimes exactly what an accountant
 * asked for.
 *
 * Half-open comparison, so March 1–April 1 and April 1–May 1 do not overlap.
 */
export function exportOverlaps(
  candidate: { from: string; toExclusive: string },
  issuances: LedgerIssuance[],
): LedgerIssuance[] {
  return issuances.filter(
    (i) =>
      i.kind === "journal-export" &&
      candidate.from < i.scope.toExclusive &&
      i.scope.from < candidate.toExclusive,
  );
}

/**
 * A-77's other reader — the unseal warns on **any issuance touching the
 * period**, whatever its kind.
 *
 * The question here is different from the export screen's, which is why the
 * rule is: an unseal changes figures *"the accountant may already hold"* (d29,
 * d18), so a balance sheet issued as at a date inside the period counts every
 * bit as much as an export of it. Warns; the refusal is d22's `filed` mark,
 * which A-77 keeps out of this log precisely because it refuses.
 */
export function issuancesTouching(period: string, issuances: LedgerIssuance[]): LedgerIssuance[] {
  const from = periodStart(period);
  const to = periodEnd(period);
  return issuances.filter((i) =>
    i.scope.kind === "as-at"
      ? i.scope.at >= from && i.scope.at <= to
      : i.scope.from <= to && from < i.scope.toExclusive,
  );
}

/** The journal lines an export of a half-open range carries (M-07 d15, d16). */
export const exportLines = (
  batches: JournalBatch[],
  from: string,
  toExclusive: string,
): JournalLine[] =>
  linesIn(batches)
    .filter((l) => l.businessDate >= from && l.businessDate < toExclusive)
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));

export { totalOf };

// ---------------------------------------------------------------------------
// d17 — the year-end seal writes its zeroing as real, visible postings
// ---------------------------------------------------------------------------

/**
 * The journal a year-end seal writes.
 *
 * **Revenue and expense are not merely *treated as* starting from zero** (d17):
 * journal lines move them into retained earnings and an accountant can read
 * them. This is M-07 d12's existing rule rather than a new one — a journal is
 * written by the artifact that causes it, and a year-end seal is an artifact
 * that causes one.
 *
 * *The alternative d17 rejected* was zeroing as a property of how
 * balance-forwards are computed: fewer rows, and it makes *why is retained
 * earnings this number* unanswerable from the ledger itself — **which is the
 * question the whole flow exists to make answerable.**
 *
 * Three things the decision fixes, each load-bearing:
 *
 *   - **Dated the last day of the year**, so the lines fall inside the period
 *     being sealed and the closing transaction computed afterwards sees them.
 *     The caller must write this batch BEFORE it recomputes balance-forwards,
 *     or the seal stores figures the zeroing has not reached.
 *   - **Sourced to the seal.** d17's accepted consequence is that the last day
 *     of a fiscal year *"carries a block of postings nobody typed and nothing
 *     in the shop did, so they must be plainly identifiable as the seal's —
 *     otherwise a reader looking at 31 December sees a day of enormous and
 *     inexplicable activity."* The source is `year-end-seal:<period>` and every
 *     line's memo says so.
 *   - **Into retained earnings**, which d13 makes untypeable precisely because
 *     this is the only thing that ever writes it.
 *
 * Returns undefined where there is nothing to zero — a year with no revenue and
 * no expense writes no batch rather than an empty one.
 */
export function yearEndClosingBatch(
  period: string,
  yearEndMonth: number,
  accounts: GLAccount[],
  batches: JournalBatch[],
  retainedEarningsAccountId: string,
  suspenseAccountId: string,
  writtenAt: string,
): JournalBatch | undefined {
  // **The guard is here and not at the call site**, which is the whole of A-74's
  // argument applied to one more rule: a caller that forgot it wrote a year-end
  // zeroing at the end of every MONTH, dated the wrong day and sourced to a
  // seal that was not a year end. That is exactly what happened — the unit
  // tests only ever passed a December, so none of them could see it, and the
  // walk found it in the app.
  if (!isYearEnd(period, yearEndMonth)) return undefined;

  const lastDay = periodEnd(period);
  const yearStartPeriod = (() => {
    const [y, m] = fiscalYearEndFor(period, yearEndMonth).split("-").map(Number);
    return m === 12 ? `${y}-01` : `${y - 1}-${String(m + 1).padStart(2, "0")}`;
  })();

  const rows = activityBetween(batches, periodStart(yearStartPeriod), lastDay);

  const postings: Posting[] = [];
  let totalCents = 0;

  for (const r of rows) {
    const account = accounts.find((a) => a.id === r.accountId);
    if (!account) continue;
    const type = accountType(account);
    if (type !== "income" && type !== "cogs" && type !== "expense") continue;

    const c = cents(r.balance);
    if (c === 0) continue;
    totalCents += c;
    // Reverse the account's own balance, so it reads zero from the new year.
    postings.push({
      accountId: r.accountId,
      businessDate: lastDay,
      amount: dollars(-c),
      currency: "CAD",
      memo: `Year-end seal ${period} — closing ${account.name} into retained earnings`,
      ...(r.section ? { section: r.section } : {}),
    });
  }

  if (postings.length === 0) return undefined;

  // The other side, in one line: the year's profit or loss.
  postings.push({
    accountId: retainedEarningsAccountId,
    businessDate: lastDay,
    amount: dollars(totalCents),
    currency: "CAD",
    memo: `Year-end seal ${period} — the year's result`,
  });

  return assembleJournal({
    id: `jb-year-end-${period}`,
    // d17 — plainly identifiable as the seal's, per M-07 d15's source rule.
    source: `year-end-seal:${period}`,
    writtenAt,
    postings,
    suspenseAccountId,
    location: "0",
  });
}
