import type { LedgerPeriodSeal, LedgerPeriodUnseal, LedgerYearFiling } from "../data/types";

/**
 * M-08 Phase 3 — sealing a period.
 *
 * The first slice of the ledger: what a period IS, when it is sealed, and what
 * refuses a seal, an unseal and a filing. Nothing here reads a posting or
 * computes a balance — those arrive with the slices that own them. What this
 * file owns is the STATE every one of them has to ask about first.
 *
 * Four rules are structural here rather than remembered:
 *
 *   d4  — a period is SEALED, never *closed*. `close` is the end-of-day close
 *         (M-03) and `CloseBatch` is its artifact, so the two acts may not
 *         share a word. Reserved in lexicon §15. Nothing in this file says
 *         `close`, and that is deliberate rather than stylistic.
 *   A-75 — a period's state is DERIVED from seal and unseal rows and is never
 *         stored. There is no `sealed` column to forget to update, run twice,
 *         or need undoing — which is M-07 d12's second objection, the one d27
 *         left standing when it reversed d1.
 *   d29 — only the MOST RECENTLY sealed period may be unsealed, and the act
 *         repeats to walk backwards. The friction is the guard.
 *   d22 — a year marked FILED refuses the unseal, and so does every month
 *         inside it. The only permanently irreversible state in this system,
 *         and the only one that depends on a Manager arming it.
 */

// ---------------------------------------------------------------------------
// What a period is
// ---------------------------------------------------------------------------

/**
 * One calendar month, written `YYYY-MM`.
 *
 * Derived from a business date by slicing it, and by nothing else. M-08's
 * Requirements are explicit that **a posting's period is its transaction date
 * and nothing else** — there is no separate field saying which month an entry
 * is filed in, and M-07 d15's `writtenAt` never affects where it lands. So
 * *"post it in October with a September date"* is not a thing this system can
 * do, and the absence of a second field is what makes that true.
 *
 * A string for the same reason `calendarDate.ts` uses one: `YYYY-MM` sorts
 * lexically in calendar order, so *latest*, *earliest* and *inside this range*
 * are all string comparisons and none of them needs a Date.
 */
export type LedgerPeriod = string;

/** The period a business date falls in. The only way to obtain one. */
export const periodOf = (businessDate: string): LedgerPeriod => businessDate.slice(0, 7);

/** The first and last day of a period, for a range filter. */
export const periodStart = (period: LedgerPeriod): string => `${period}-01`;
export const periodEnd = (period: LedgerPeriod): string => {
  const [y, m] = period.split("-").map(Number);
  // Day 0 of the next month is the last day of this one, which is how February
  // and the leap years get handled without a table.
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

/** The period before this one. Used to offer the oldest unsealed month (step 16). */
export const previousPeriod = (period: LedgerPeriod): LedgerPeriod => {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// The fiscal year (d5, M-06 d64)
// ---------------------------------------------------------------------------

/**
 * d5 — the fiscal year end is a STORE SETTING. This flow reads it and never
 * asks.
 *
 * M-06 d64 defaults it to 31 December, which is what most small retailers use
 * and the least surprising thing for a Manager to find already set. It is
 * passed in as an argument rather than read from a store here, so this stays a
 * pure function and so the caller is the one that has to know where the
 * setting lives.
 *
 * What the setting buys is a CHECK rather than a prompt (d5): the system knows
 * which seal is a year end and can say so before it happens, instead of asking
 * *"is this also your year end?"* at each seal and being unable to validate
 * either answer.
 *
 * `yearEndMonth` is 1–12. December is 12.
 */
export function fiscalYearEndFor(period: LedgerPeriod, yearEndMonth: number): LedgerPeriod {
  const [y, m] = period.split("-").map(Number);
  const year = m <= yearEndMonth ? y : y + 1;
  return `${year}-${String(yearEndMonth).padStart(2, "0")}`;
}

/** Whether sealing this period also seals a fiscal year (d17, step 21). */
export const isYearEnd = (period: LedgerPeriod, yearEndMonth: number): boolean =>
  Number(period.split("-")[1]) === yearEndMonth;

// ---------------------------------------------------------------------------
// Derived state (A-75)
// ---------------------------------------------------------------------------

/**
 * A-75 — the LIVE seal for a period: the seal row that no unseal row reverses.
 *
 * A seal appends a row. An unseal appends a row NAMING THE SEAL it reverses.
 * A period is sealed **if and only if** it has a seal with no unseal against
 * it. Re-sealing after an unseal appends a second seal, which becomes the live
 * one — so the history of a period that was sealed, unsealed and sealed again
 * is three rows and is readable, where a `sealed` boolean would be one row
 * that had been true, false and true and remembered none of it.
 */
export function liveSeal(
  period: LedgerPeriod,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): LedgerPeriodSeal | undefined {
  const reversed = new Set(unseals.map((u) => u.sealId));
  return seals.find((s) => s.period === period && !reversed.has(s.id));
}

/** Derived, never stored (A-75). */
export const isSealed = (
  period: LedgerPeriod,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): boolean => liveSeal(period, seals, unseals) !== undefined;

/** Every sealed period, earliest first. */
export function sealedPeriods(
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): LedgerPeriod[] {
  const reversed = new Set(unseals.map((u) => u.sealId));
  return [...new Set(seals.filter((s) => !reversed.has(s.id)).map((s) => s.period))].sort();
}

/**
 * d29 — the only period an unseal may reach.
 *
 * *"To reach December from March a Manager unseals March, then February, then
 * January, then December — four deliberate acts, each authorized and each
 * carrying its own reason."*
 */
export function mostRecentlySealed(
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): LedgerPeriod | undefined {
  const sealed = sealedPeriods(seals, unseals);
  return sealed.length > 0 ? sealed[sealed.length - 1] : undefined;
}

/**
 * d22 — whether the fiscal year this period belongs to has been marked filed.
 *
 * The mark is on the YEAR, so it reaches every month inside it: a filed year
 * refuses the unseal *"and so does every month inside it"* (step 23).
 */
export const isFiled = (
  period: LedgerPeriod,
  filings: LedgerYearFiling[],
  yearEndMonth: number,
): boolean => filings.some((f) => f.fiscalYearEnd === fiscalYearEndFor(period, yearEndMonth));

// ---------------------------------------------------------------------------
// What refuses each act
// ---------------------------------------------------------------------------

/**
 * The house shape (M-05's `unclearRefusal`): the RULE as a pure function
 * returning the refusal text, so it can be held to a test rather than being
 * reachable only by driving a screen.
 */

/**
 * A-75 — why this period may not be sealed, or undefined if it may.
 *
 * **The prototype enforces by check what the product enforces by structure,
 * and the two are not the same strength.** A-75 puts a partial unique index on
 * the live seal so that a second one is *unrepresentable*, and M-08-T7 asserts
 * exactly that — *"refused, not by a check someone remembered but because a
 * live seal is unique per period."* A function returning a string is a check
 * someone remembered. It gives the same answer here and would not survive two
 * Managers pressing Seal at once, which is the case A-75's index exists for.
 *
 * `blockers` is what step 17 passes: an unbalanced posting, an invalid account,
 * section or location — listed rather than counted, because step 17 *reports
 * every failure without sealing*. **A Suspense balance is not among them**
 * (d42, superseding d40): it is reported by `suspenseNotice` and blocks
 * nothing, which is the reference model's position and d15's outcome.
 */
export function sealRefusal(
  period: LedgerPeriod,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  blockers: string[] = [],
): string | undefined {
  if (isSealed(period, seals, unseals)) return `${period} is already sealed.`;
  if (blockers.length > 0) return blockers.join(" ");
  return undefined;
}

/**
 * d15, step 17, step 18 — what a seal SAYS, split by whether it stops.
 *
 * Two gates at two moments, which is the shape this flow inherits from M-07
 * d10: Suspense at write time so nothing blocks the shop ending its day, and a
 * refusal at the seal, where blocking costs nothing.
 *
 * **A Suspense line does not block** (d15). Refusing would deadlock the books,
 * and not rarely — it is the guaranteed outcome the first time Suspense does
 * the job it exists for, because M-07 d10 records that *"no Manager action can
 * create one and none can clear one"*. So a seal that refused on Suspense is a
 * seal no Manager could ever satisfy: the books stop in the month the defect
 * landed and never move again. It is REPORTED, and its gross total is carried
 * onto the closing transaction so any statement drawn from that period can say
 * so.
 *
 * `suspenseGross` is gross and not net (M-07 d25): short three dollars on one
 * date and over three on another is two defects, and a net of zero is the one
 * answer that hides both.
 */
export interface SealReport {
  /** Every failure, reported together — step 17 does not stop at the first. */
  blocking: string[];
  /**
   * d42 — **reported and carried, never blocking**, and always gross.
   * ~~d40 — blocking where it is non-zero~~ — d40 is superseded in turn, which
   * restores what d15 said with a reason d15 did not have.
   */
  suspenseGross: number;
  /** Whether this seal also seals a fiscal year, said BEFORE it happens (d17). */
  sealsFiscalYear: boolean;
}

export function sealReport(
  period: LedgerPeriod,
  yearEndMonth: number,
  blockers: string[] = [],
  suspenseGross = 0,
): SealReport {
  // d42 — a Suspense balance is REPORTED and does not block. d40 refused it and
  // is superseded: the reference model's nearest account carries between months
  // and is reviewed rather than cleared, and stricter than the trade was not the
  // thing to be. d15's outcome, restored on grounds d15 never gave.
  //
  // The figure is GROSS because that is the one that does not hide two defects
  // as none (M-07 d25), and it is the one surviving half of both d15 and d40.
  return {
    blocking: [...blockers],
    suspenseGross,
    sealsFiscalYear: isYearEnd(period, yearEndMonth),
  };
}

/**
 * d42 — what the seal SAYS about a carried Suspense balance, or undefined
 * where there is none. Never a refusal.
 *
 * *"The remaining entries should only be those that you will be able to deal
 * with at a later date"* is the reference's rule, and it is **guidance rather
 * than software** — it expects the carried balance to be one somebody can
 * explain to the accountant, and enforces nothing. This says the figure and
 * names the route; whether a Manager takes it is theirs.
 */
export function suspenseNotice(period: LedgerPeriod, suspenseGross: number): string | undefined {
  if (Math.round(suspenseGross * 100) === 0) return undefined;
  return (
    `Suspense carries ${Math.abs(suspenseGross).toFixed(2)} into the seal of ${period}, gross. ` +
    `A defect in this system, never a data-entry error (M-07 d10) — clear it first with an override ` +
    `posting carrying a reason (d14, d39), or seal over it and be able to say what it relates to.`
  );
}

/**
 * d18, d22, d29 — why this period may not be unsealed, or undefined if it may.
 *
 * Three refusals, and they are checked in the order a Manager would hit them.
 * The FILED check comes before the most-recent check because it is the one
 * that never lifts: telling someone to unseal March first, when December is
 * filed and will refuse anyway, sends them through three pointless acts to
 * reach a wall.
 */
export function unsealRefusal(
  period: LedgerPeriod,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  filings: LedgerYearFiling[],
  yearEndMonth: number,
  reason: string,
): string | undefined {
  if (!isSealed(period, seals, unseals)) return `${period} is not sealed.`;

  // d22 — the only permanently irreversible state in this system.
  if (isFiled(period, filings, yearEndMonth)) {
    const year = fiscalYearEndFor(period, yearEndMonth);
    return `The fiscal year ending ${year} has been marked filed, so ${period} can never be unsealed.`;
  }

  // d29 — supersedes d16's *any sealed period*. The friction is the guard.
  const latest = mostRecentlySealed(seals, unseals);
  if (period !== latest) {
    return `Only the most recently sealed period can be unsealed. Unseal ${latest} first.`;
  }

  // d18 — an unseal is an artifact: who, when, A REQUIRED REASON, and which
  // period it reopened. An unseal changes figures the accountant may already
  // hold, so the record is the half that carries the weight.
  if (reason.trim() === "") return "An unseal needs a reason.";

  return undefined;
}

/**
 * d22 — why this fiscal year may not be marked filed, or undefined if it may.
 *
 * **The first refusal is an inference, not a recorded decision.** d22 says a
 * year is marked filed *"when the return has gone in"* and says nothing about
 * what state the year must be in first. Marking an unsealed year filed would
 * make it permanently unsealable while it was still open, which is incoherent
 * — but nobody has written that down, and it is carried as an open question
 * rather than presented as settled.
 */
export function markFiledRefusal(
  fiscalYearEnd: LedgerPeriod,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
  filings: LedgerYearFiling[],
): string | undefined {
  if (filings.some((f) => f.fiscalYearEnd === fiscalYearEnd)) {
    return `The fiscal year ending ${fiscalYearEnd} is already marked filed.`;
  }
  // Inferred, not recorded — see above.
  if (!isSealed(fiscalYearEnd, seals, unseals)) {
    return `Seal ${fiscalYearEnd} before marking the year filed.`;
  }
  return undefined;
}

/**
 * Step 16 — the oldest unsealed month, which is what *Seal a period* offers.
 *
 * `firstPeriod` is where the books start (step 1, d6's opening position). With
 * no opening position there is nothing to offer, because there is no period
 * before which nothing may be dated (A-73) and so no oldest unsealed month —
 * only an unbounded past.
 */
export function oldestUnsealed(
  firstPeriod: LedgerPeriod | undefined,
  today: LedgerPeriod,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): LedgerPeriod | undefined {
  if (!firstPeriod) return undefined;
  for (let p = firstPeriod; p <= today; p = nextPeriod(p)) {
    if (!isSealed(p, seals, unseals)) return p;
  }
  return undefined;
}

/** The period after this one. */
export const nextPeriod = (period: LedgerPeriod): LedgerPeriod => {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// d11 — nothing writes into a sealed period, BY ANY ROUTE
// ---------------------------------------------------------------------------

/**
 * Why a day may not be restated, or undefined if it may.
 *
 * **This is the one route d11 singles out.** M-08's Requirements say *"nothing
 * may write into a sealed period, by any route… including [M-03](M-03)'s Undo
 * End of Day, which is the one reversal in this system that does not post
 * forward."* Every other correction in Wax Works appends a dated entry (M-07
 * d8), so a sealed period is safe from them by construction; an Undo reaches
 * back and restates the day itself, which is exactly what a seal forbids.
 *
 * It lives here rather than in the close because the predicate is the ledger's.
 * That is A-41's line — *the seam immutability is put on* — and in the product
 * it is the same shape as `invoice_is_paid()`: the ledger owns the predicate,
 * M-03's function calls it, and M5 can ship it returning false until M-08
 * exists.
 *
 * **A filed year needs no separate check.** d22 makes a filed year unsealable,
 * so its periods stay sealed and this refuses on that alone — which is why
 * M-08-T10's *"never released for a day inside a filed year"* falls out rather
 * than being enforced twice.
 */
export function closeUndoRefusal(
  businessDate: string,
  seals: LedgerPeriodSeal[],
  unseals: LedgerPeriodUnseal[],
): string | undefined {
  const period = periodOf(businessDate);
  if (!isSealed(period, seals, unseals)) return undefined;
  return `${period} is sealed, so ${businessDate} cannot be restated. An Undo End of Day reaches back and rewrites the day rather than posting forward, which is the one thing a seal refuses (M-08 d11). Unseal ${period} first.`;
}
