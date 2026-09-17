import type { TenderRow, TenderType } from "../data/types";

/**
 * E-05 d36 — **what the till offers is the store's configured tenders**, not
 * the behaviours behind them.
 *
 * M-06 d4 already said the display name is configurable and the behaviour is
 * not; a pad built from hardcoded behaviour names ignored the configuration
 * entirely, so a shop that renamed `Credit Card` to `Cards` saw neither.
 *
 * Two exclusions, both M-06's:
 *
 *   active      — *active* governs what is OFFERED for new work (d9, A-59).
 *                 It never governs what RESOLVES: a Sale already tendered on a
 *                 since-retired row still posts where it always did
 *                 ([M-07](../../../docs/flows/M-07-chart-of-accounts.md) d18).
 *   systemOwned — d26's rounding tender is written by the system and never
 *                 offered. Putting it on the pad would let a customer's cash be
 *                 rung into Cash over / short.
 */
export const offerableTenders = (rows: TenderRow[]): TenderRow[] =>
  rows.filter((r) => r.active && !r.systemOwned);

/**
 * The row a behaviour resolves to where nothing named one.
 *
 * Used by the paths that raise a tender **on the customer's behalf** rather
 * than from the pad — a gift card redemption, a refund, the reversing tender a
 * void appends — and by the journal for Sales recorded before the pad offered
 * rows at all. Where a behaviour has several rows this cannot tell them apart,
 * which is the whole reason the pad now asks instead of guessing.
 */
export const defaultTenderRow = (behavior: TenderType, rows: TenderRow[]): TenderRow | undefined => {
  const candidates = rows.filter((r) => r.behavior === behavior && !r.systemOwned);
  return candidates.find((r) => r.active) ?? candidates[0];
};
