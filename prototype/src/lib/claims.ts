import type { ClaimLine, ClaimVoid, Invoice, SupplierClaim } from "../data/types";

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
 * E-04 d24 and d29. Only `Credited` and `Abandoned` end a claim, and both are
 * statuses — a void is a REVERSAL that returns the claim to unsent, not a
 * third ending (architecture A-46, amending A-44). So this is a plain status
 * read, and nothing has to remember a second mechanism.
 */
export const claimIsLive = (c: SupplierClaim): boolean => c.status !== "Abandoned";

/**
 * The numbers this claim has burned through, newest first. A claim sent,
 * voided and sent again retires one number per send (d26, d29), and the void
 * rows are the only record of them — the claim itself carries just the number
 * it holds now, if any.
 */
export const retiredNumbers = (c: SupplierClaim, voids: ClaimVoid[]): number[] =>
  voids
    .filter((v) => v.claimId === c.id)
    .map((v) => v.claimNumber)
    .sort((a, b) => b - a);

export type ClaimPhase = "unsent" | "waiting" | "credited" | "abandoned";

export function claimPhase(c: SupplierClaim): ClaimPhase {
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

/**
 * E-04 d28 — the Invoices a claim line may name: the ones this Supplier has
 * actually shipped THIS RECORD to the store on. Three filters, each earning
 * its place:
 *
 *   supplier    a claim is against one supplier, so another's paperwork is
 *               never an answer;
 *   finalized   a Draft has not arrived, so nothing was received on it;
 *   carries it  the Invoice has a line for this Record.
 *
 * The third is the one that makes the reference **checkable** rather than
 * merely bounded: a claim about a copy of Rumours may point at any Rumours
 * shipment from them and at nothing else.
 *
 * Record-level, not copy-level, and deliberately: a copy is minted from one
 * Invoice line, so a copy-level list would always hold exactly one entry and
 * there would be nothing to choose. Where they have never shipped the Record,
 * this is empty and the only honest answer is `{ kind: "none" }`.
 */
export const eligibleInvoices = (
  recordId: string,
  supplierId: string,
  invoices: Invoice[],
): Invoice[] =>
  invoices
    .filter(
      (iv) =>
        iv.supplierId === supplierId &&
        iv.status !== "Draft" &&
        iv.lines.some((l) => l.recordId === recordId),
    )
    .sort((a, b) => (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? ""));

/** What to print in the Invoice column. `none` is a stated fact, not a blank. */
export function lineAgainstLabel(line: ClaimLine, invoices: Invoice[]): string {
  if (line.against.kind === "none") return "no invoice";
  const id = line.against.invoiceId;
  return invoices.find((iv) => iv.id === id)?.invoiceNumber ?? "—";
}
