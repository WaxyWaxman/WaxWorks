import type { ClaimVoid, SupplierClaim } from "../data/types";

/**
 * The derived facts about a claim. E-04 d21 refuses a stored status for
 * anything nobody sets, and d25 says which column each derivation keys on.
 *
 * The rule these all follow is architecture A-43: **a derived state keys on a
 * fact the system writes, never on one a person may edit.** That is why
 * `isSent` reads `sentAt` and not `claimNumber` — d10 lets an Employee type
 * the number in, so a state hung on it would flip when somebody corrected a
 * typo. The number is ours to quote and nothing derives from it (d26).
 */

/** E-04 d25 — absent sent date is what "unsent" means. */
export const isSent = (c: SupplierClaim): boolean => c.sentAt != null;

/**
 * E-04 d24, d27 and architecture A-44's accepted consequence, in one place.
 *
 * A claim has two terminal dispositions reached by DIFFERENT mechanisms —
 * abandoned is a status the row carries, voided is the presence of a row in
 * another table — so "is this claim finished" is a status read OR a lookup,
 * and A-44 warns that code remembering only the first counts voided claims as
 * live. This function is the single place that remembers both.
 */
export const claimIsVoided = (c: SupplierClaim, voids: ClaimVoid[]): boolean =>
  voids.some((v) => v.claimId === c.id);

export const claimIsLive = (c: SupplierClaim, voids: ClaimVoid[]): boolean =>
  c.status !== "Abandoned" && !claimIsVoided(c, voids);

export type ClaimPhase = "unsent" | "waiting" | "credited" | "abandoned" | "voided";

export function claimPhase(c: SupplierClaim, voids: ClaimVoid[]): ClaimPhase {
  if (claimIsVoided(c, voids)) return "voided";
  if (c.status === "Abandoned") return "abandoned";
  if (c.status === "Credited") return "credited";
  return isSent(c) ? "waiting" : "unsent";
}

/** What was asked for. The memo's figure may differ — E-04 d20. */
export const claimTotal = (c: SupplierClaim): number =>
  Math.round(c.lines.reduce((n, l) => n + l.cost * l.qty, 0) * 100) / 100;

/**
 * What the claim is worth to Accounts Payable. E-04 d20 makes the credit
 * memo the point of truth, so a Credited claim counts at what the memo
 * GRANTS, not at what was claimed. `creditedAmount` absent = they granted it
 * all. Mirrors the reading M-05 d26 puts into the balance.
 */
export const claimCredited = (c: SupplierClaim): number =>
  c.creditedAmount ?? claimTotal(c);

/** E-04 d20's gap — what the store absorbed. Zero when they granted it all. */
export const claimAbsorbed = (c: SupplierClaim): number =>
  Math.round((claimTotal(c) - claimCredited(c)) * 100) / 100;

/**
 * E-04 d23 — days since it was sent. The figure that prompts d24's disposal:
 * without it a claim nobody answers is not a decision anyone takes, it is a
 * row that sits. Deliberately NOT banded into 30/60/90 buckets; a per-row
 * fact and a report are different things, and only the first is a layout
 * decision (the line M-05 draws for the same reason).
 */
export function daysWaiting(c: SupplierClaim, today: Date): number | undefined {
  if (!c.sentAt) return undefined;
  const sent = new Date(c.sentAt.slice(0, 10) + "T00:00:00");
  const now = new Date(today.toLocaleDateString("en-CA") + "T00:00:00");
  return Math.max(0, Math.round((now.getTime() - sent.getTime()) / 86400000));
}

/**
 * E-04 d22 — a batch's display name. The separator is chosen as the claim is
 * raised and blank by default, so most claims sit in the base batch and
 * breaking one out is a deliberate act.
 */
export const batchName = (c: SupplierClaim): string =>
  c.separator ? `Batch ${c.separator}` : "Base batch";
