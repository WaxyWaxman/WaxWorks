import type {
  JournalBatch,
  JournalLine,
  LedgerClosingBalance,
  LedgerClosingTransaction,
  LedgerPeriodSeal,
  LedgerPeriodUnseal,
  ReviewFlag,
} from "../data/types";
import { isSealed, periodEnd, periodOf, periodStart, previousPeriod } from "./ledgerPeriods";

/**
 * M-08 d20, architecture A-76 — balance-forwards, and reading an account.
 *
 * **A stored balance-forward is a materialised recomputation.** That one
 * sentence is the whole module. d20 stores the closing transaction *and* keeps
 * it recomputable, and names the consequence without resolving it — two paths
 * to one figure can disagree, and *"something has to be able to say so."* A-76
 * removes the question rather than answering it: the closing transaction is
 * **written as the result of the recomputation** at seal and rewritten at
 * unseal, so *stored* is by definition the last *recomputed*, and **which one
 * wins stops being a question anyone can ask.**
 *
 * So there is exactly one function that computes a balance — `recomputeAsAt`
 * — and the stored figure is its output, kept. Everything else reads one or
 * the other and they cannot drift by construction, only by defect. When they
 * do drift, `divergenceFlag` is what says so.
 *
 * *What A-76 accepts, in its own words:* **"the system now holds a figure whose
 * correctness is asserted by a job rather than by construction."**
 */

const cents = (n: number): number => Math.round(n * 100);
const dollars = (c: number): number => c / 100;

// ---------------------------------------------------------------------------
// The grain
// ---------------------------------------------------------------------------

/**
 * d2, d12 — `(account, section, location)`. A section is optional and its blank
 * means *not applicable*; a location is required.
 *
 * The key is a string so grouping is a Map lookup rather than a nested scan,
 * and it uses `\u0000` rather than a printable separator because a section code
 * is store-defined text and could otherwise collide with the delimiter.
 */
const keyOf = (l: { accountId: string; section?: string; location: string }): string =>
  `${l.accountId}\u0000${l.section ?? ""}\u0000${l.location}`;

const fromKey = (k: string): Omit<LedgerClosingBalance, "balance"> => {
  const [accountId, section, location] = k.split("\u0000");
  return { accountId, ...(section ? { section } : {}), location };
};

/** What narrows an enquiry. Absent means *every*; it never means *blank*. */
export interface BalanceFilter {
  accountId?: string;
  section?: string;
  location?: string;
}

/**
 * One predicate over anything carrying the three dimensions, so a line and a
 * stored balance are narrowed by the same rule rather than by two that have to
 * be kept in step. That is d2's promise applied to the code as well as the
 * query: *"totalling an account across all Sections and totalling it within one
 * are the same query with a different filter."*
 */
const matches = (
  d: { accountId: string; section?: string; location: string },
  f: BalanceFilter,
): boolean =>
  (f.accountId === undefined || d.accountId === f.accountId) &&
  (f.section === undefined || d.section === f.section) &&
  (f.location === undefined || d.location === f.location);

/** Every line in every batch, flattened. A batch is not one date (M-07 d14). */
export const linesIn = (batches: JournalBatch[]): JournalLine[] =>
  batches.flatMap((b) => b.lines);

// ---------------------------------------------------------------------------
// The recomputation — authoritative (A-76)
// ---------------------------------------------------------------------------

/**
 * Every balance as at a date, from the journal and nothing else.
 *
 * **This is the authoritative path** (A-76), and it is the only place a balance
 * is ever computed. `asAt` is inclusive, and a line dated after it is excluded
 * — which is also d30's rule for statements: *"a statement includes only lines
 * dated on or before its as-at date… any other answer makes the date on the
 * document a suggestion."* A-73 permits a future-dated posting, so this is not
 * a theoretical case.
 *
 * Signed: positive is a debit balance, negative a credit balance. A group that
 * nets to zero is dropped, on `assembleJournal`'s rule — a $0.00 row is noise
 * an accountant reads before discarding.
 */
export function recomputeAsAt(
  batches: JournalBatch[],
  asAt: string,
  filter: BalanceFilter = {},
): LedgerClosingBalance[] {
  const groups = new Map<string, number>();
  for (const l of linesIn(batches)) {
    if (l.businessDate > asAt) continue; // d30, and A-73's future dates
    if (!matches(l, filter)) continue;
    const k = keyOf(l);
    groups.set(k, (groups.get(k) ?? 0) + cents(l.debit) - cents(l.credit));
  }
  return [...groups.entries()]
    .filter(([, c]) => c !== 0)
    .map(([k, c]) => ({ ...fromKey(k), balance: dollars(c) }))
    .sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/** The activity in a half-open-feeling but inclusive calendar range. */
export function activityBetween(
  batches: JournalBatch[],
  from: string,
  to: string,
  filter: BalanceFilter = {},
): LedgerClosingBalance[] {
  const groups = new Map<string, number>();
  for (const l of linesIn(batches)) {
    if (l.businessDate < from || l.businessDate > to) continue;
    if (!matches(l, filter)) continue;
    const k = keyOf(l);
    groups.set(k, (groups.get(k) ?? 0) + cents(l.debit) - cents(l.credit));
  }
  return [...groups.entries()]
    .filter(([, c]) => c !== 0)
    .map(([k, c]) => ({ ...fromKey(k), balance: dollars(c) }))
    .sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/** One figure out of a set of rows — what an enquiry on one account shows. */
export const totalOf = (rows: LedgerClosingBalance[]): number =>
  dollars(rows.reduce((s, r) => s + cents(r.balance), 0));

// ---------------------------------------------------------------------------
// The closing transaction — the recomputation, materialised
// ---------------------------------------------------------------------------

/**
 * Step 20, d20, A-76 — what a seal writes.
 *
 * Built by **calling the recomputation**, never by an independent sum. That is
 * not a convenience: it is what makes A-76's *"stored is by definition the last
 * recomputed"* structurally true rather than a claim about discipline. A second
 * summing routine here would reintroduce exactly the two paths A-76 removed.
 *
 * `suspenseGross` comes from the seal's own report (d15) and is carried here
 * because step 20 puts it here and because a statement drawn from the period
 * has to be able to say so.
 */
export function closingTransactionFor(
  period: string,
  sealId: string,
  batches: JournalBatch[],
  suspenseGross: number,
  computedAt: string,
): LedgerClosingTransaction {
  return {
    id: `ct-${period}-${sealId}`,
    period,
    sealId,
    balances: recomputeAsAt(batches, periodEnd(period)),
    suspenseGross,
    computedAt,
  };
}

// ---------------------------------------------------------------------------
// A-76 — the divergence, and the flag that says so
// ---------------------------------------------------------------------------

export interface Divergence {
  accountId: string;
  section?: string;
  location: string;
  stored: number;
  recomputed: number;
  difference: number;
}

/**
 * Every place a fresh recomputation disagrees with what was stored.
 *
 * Compares in both directions: a key the recomputation produces and the stored
 * set does not is as much a divergence as a figure that differs, and so is the
 * reverse. Checking only the stored keys would miss the case where a line
 * appeared in a sealed period — **which is the exact defect this exists to
 * catch**, because d11 says nothing may write into a sealed period by any
 * route, so a new line inside one means a route exists that should not.
 */
export function divergences(
  stored: LedgerClosingTransaction,
  batches: JournalBatch[],
): Divergence[] {
  const fresh = recomputeAsAt(batches, periodEnd(stored.period));
  const storedBy = new Map(stored.balances.map((b) => [keyOf(b), b.balance]));
  const freshBy = new Map(fresh.map((b) => [keyOf(b), b.balance]));

  const out: Divergence[] = [];
  for (const k of new Set([...storedBy.keys(), ...freshBy.keys()])) {
    const s = cents(storedBy.get(k) ?? 0);
    const f = cents(freshBy.get(k) ?? 0);
    if (s === f) continue;
    out.push({ ...fromKey(k), stored: dollars(s), recomputed: dollars(f), difference: dollars(f - s) });
  }
  return out.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/**
 * A-76, A-68 — the flag a divergence raises, or undefined where there is none.
 *
 * **Only on a SEALED period.** An unsealed period's closing transaction is
 * stale by design — d29 has the most recently sealed period unsealed and
 * rewritten, and A-76 narrows to exactly that case, so a difference there is
 * the system working rather than failing. Flagging it would be the thing A-71
 * warns about from the other side: a flag that fires when nothing is wrong
 * trains people to acknowledge without reading.
 *
 * **Null actor** (`recordedBy` absent), like `journal-imbalance`. No Manager
 * can cause one and none can clear one; whatever renders it must read the
 * absence as *the system* and must not invite anyone to fix it by hand.
 */
export function divergenceFlag(
  stored: LedgerClosingTransaction,
  batches: JournalBatch[],
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  at: string,
): ReviewFlag | undefined {
  if (!isSealed(stored.period, seals, unseals)) return undefined;

  const found = divergences(stored, batches);
  if (found.length === 0) return undefined;

  const worst = [...found].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))[0];
  return {
    id: `flag-divergence-${stored.period}`,
    kind: "ledger-balance-divergence",
    summary:
      `${stored.period} was sealed with a balance that no longer recomputes: ` +
      `${found.length} account${found.length === 1 ? "" : "s"} differ, the largest by ` +
      `${Math.abs(worst.difference).toFixed(2)}.`,
    // A-68, A-76 — no `recordedBy`. The system raised it.
    at,
    acknowledged: false,
  };
}

// ---------------------------------------------------------------------------
// Step 24 — reading an account
// ---------------------------------------------------------------------------

/**
 * Step 24 — *balance forward · activity in the period · new balance forward*,
 * with every line behind it.
 *
 * **The middle term is true without an opening position and without a seal; the
 * other two are not.** Step 24 says so in those words, and it is the whole
 * reason the two outer figures are optional here rather than zero. A zero would
 * read as *the account was empty*, which is a claim, where absent reads as
 * *this system cannot tell you*, which is the truth.
 *
 * The outer two come from **stored** closing transactions (d20 — *"reporting
 * reads it rather than re-summing history"*), and are absent where no seal has
 * produced one. The middle is always recomputed, because activity inside an
 * open period is not stored anywhere and never could be.
 */
export interface AccountEnquiry {
  /** Absent where the period before this one has never been sealed. */
  balanceForward?: number;
  /** Always available (step 24). */
  activity: number;
  /** Absent where this period has not been sealed. */
  newBalanceForward?: number;
  lines: JournalLine[];
  /** Why either outer figure is absent, in words a Manager can act on. */
  unavailable?: string;
}

export function accountEnquiry(
  period: string,
  batches: JournalBatch[],
  closings: LedgerClosingTransaction[],
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  filter: BalanceFilter,
): AccountEnquiry {
  const from = periodStart(period);
  const to = periodEnd(period);

  const liveClosing = (p: string): LedgerClosingTransaction | undefined =>
    isSealed(p, seals, unseals)
      ? closings.find((c) => c.period === p && c.sealId === liveSealIdFor(p, seals, unseals))
      : undefined;

  const prior = liveClosing(previousPeriod(period));
  const own = liveClosing(period);

  const pick = (ct: LedgerClosingTransaction | undefined): number | undefined =>
    ct === undefined ? undefined : totalOf(ct.balances.filter((b) => matches(b, filter)));

  const lines = linesIn(batches)
    .filter((l) => l.businessDate >= from && l.businessDate <= to && matches(l, filter))
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));

  const balanceForward = pick(prior);
  const newBalanceForward = pick(own);

  const missing: string[] = [];
  if (balanceForward === undefined) missing.push(`${previousPeriod(period)} has never been sealed`);
  if (newBalanceForward === undefined) missing.push(`${period} is not sealed`);

  return {
    ...(balanceForward !== undefined ? { balanceForward } : {}),
    activity: totalOf(activityBetween(batches, from, to, filter)),
    ...(newBalanceForward !== undefined ? { newBalanceForward } : {}),
    lines,
    ...(missing.length > 0
      ? {
          unavailable:
            `The activity below is complete. A balance forward is not available because ` +
            `${missing.join(", and ")}.`,
        }
      : {}),
  };
}

/** A-75's live seal, by id — the one no unseal reverses. */
function liveSealIdFor(
  period: string,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): string | undefined {
  const reversed = new Set(unseals.map((u) => u.sealId));
  return seals.find((s) => s.period === period && !reversed.has(s.id))?.id;
}

/** The period a date falls in — re-exported so callers need one import. */
export { periodOf };

// ---------------------------------------------------------------------------
// d40, M-07 d25 — the Suspense total a seal reports, and refuses on
// ---------------------------------------------------------------------------

/**
 * A period's Suspense total, **gross**.
 *
 * **Gross and not net, and the difference is the whole point** (M-07 d25, d15's
 * surviving half): a period *"short three dollars on one date and over three on
 * another must report six, or two defects report as none."* The account's
 * balance would read zero in that case, which is exactly the answer that hides
 * both.
 *
 * So each **business date** is one defect: net within the date, take the
 * absolute value, and sum across dates. Netting across dates would reintroduce
 * the cancellation; not netting within a date would report one defect twice.
 *
 * This is what d40 refuses a seal on, and what the refusal names.
 */
export function suspenseGrossFor(
  period: string,
  batches: JournalBatch[],
  suspenseAccountId: string,
): number {
  const byDate = new Map<string, number>();
  for (const l of linesIn(batches)) {
    if (l.accountId !== suspenseAccountId) continue;
    if (periodOf(l.businessDate) !== period) continue;
    byDate.set(l.businessDate, (byDate.get(l.businessDate) ?? 0) + cents(l.debit) - cents(l.credit));
  }
  let gross = 0;
  for (const c of byDate.values()) gross += Math.abs(c);
  return dollars(gross);
}
