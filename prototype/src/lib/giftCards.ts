import type { GiftCard, Sale } from "../data/types";
import { round2 } from "./totals";

// A-51 — a gift card's balance is the sum of its movements, and a redemption
// that would drive it below zero is REFUSED, NEVER CLAMPED: "clamping converts
// an over-redemption into a silent loss, which is what the prototype does
// today". This module is where the prototype stops doing that.
//
// The prototype still stores `balance` rather than deriving it (the same
// in-memory shortcut prototype.md records for an Invoice's paid state); what
// matters for the spec is that no route can spend more than the card holds.

// A tender's money moves at completeSale, or at once on a Current Sale (E-05
// d32) — so on an Open or Held Sale it has not moved yet. Mirrors the store's
// own `settled = sale.state === "Current"` test in addTender.
const tendersNotYetMoved = (state: Sale["state"]) => state === "Open" || state === "Held";

// What the card can still cover for THIS Sale. Where the Sale's tenders have
// not moved money yet, a second Gift Card tender against the same code has to
// see the first one, or two $20 tenders on a $25 card would both pass the
// check and land as $40.
export function giftCardAvailable(card: GiftCard | undefined, sale: Pick<Sale, "state" | "tenders">): number {
  if (!card) return 0;
  const pending =
    tendersNotYetMoved(sale.state)
      ? sale.tenders
          .filter((t) => t.type === "Gift Card" && t.reference === card.code)
          .reduce((n, t) => n + t.amount, 0)
      : 0;
  return round2(card.balance - pending);
}

// The refusal, worded for the person at the till — M-04 d13 and A-54 both
// require a refusal to name what blocked it. `null` means the redemption is
// within the card.
export function giftCardRedeemRefusal(
  cards: GiftCard[],
  sale: Pick<Sale, "state" | "tenders">,
  code: string | undefined,
  amount: number,
): string | null {
  const ref = (code ?? "").trim();
  if (!ref) return "A gift card tender needs the card's code.";
  const card = cards.find((g) => g.code === ref);
  if (!card) return `No gift card ${ref} — check the code, or load a new card as a line item (E-05 decision 10).`;
  if (card.balance <= 0) return `${ref} has not been loaded. Loading is a line item, not a tender (E-05 decision 10).`;
  const available = giftCardAvailable(card, sale);
  if (amount > available) {
    const held = available < card.balance ? ` (${money(card.balance)} less ${money(card.balance - available)} already on this Sale)` : "";
    return `${ref} carries ${money(available)}${held}. A redemption of ${money(amount)} is refused, never clamped (A-51).`;
  }
  return null;
}

const money = (n: number) => `$${n.toFixed(2)}`;
