import { describe, expect, it } from "vitest";
import { giftCardAvailable, giftCardRedeemRefusal } from "./giftCards";
import type { GiftCard, Sale, Tender } from "../data/types";

const cards: GiftCard[] = [
  { code: "GC-4417", balance: 25 },
  { code: "GC-8890", balance: 0 },
];

const gc = (amount: number, reference = "GC-4417"): Tender =>
  ({ id: `t-${amount}`, type: "Gift Card", amount, reference }) as Tender;

const sale = (tenders: Tender[], state: Sale["state"] = "Open"): Pick<Sale, "state" | "tenders"> => ({ state, tenders });

describe("A-51 — a redemption is refused, never clamped", () => {
  it("passes a redemption within the balance", () => {
    expect(giftCardRedeemRefusal(cards, sale([]), "GC-4417", 25)).toBeNull();
    expect(giftCardRedeemRefusal(cards, sale([]), "GC-4417", 10)).toBeNull();
  });

  it("refuses one past the balance and names the figures", () => {
    // Before this, applyTenderEffect did Math.max(0, balance - amount): a $40
    // tender on a $25 card recorded $40 received and left the card at $0 —
    // the silent loss A-51 describes, and issue #16 reported.
    const r = giftCardRedeemRefusal(cards, sale([]), "GC-4417", 40);
    expect(r).toContain("$25.00");
    expect(r).toContain("$40.00");
    expect(r).toContain("refused, never clamped");
  });

  it("sees the Open Sale's own pending gift-card tenders", () => {
    // An Open Sale's tenders have not moved money yet, so the check has to
    // count them or two $20 tenders on a $25 card both pass.
    const s = sale([gc(20)]);
    expect(giftCardAvailable(cards[0], s)).toBe(5);
    expect(giftCardRedeemRefusal(cards, s, "GC-4417", 5)).toBeNull();
    expect(giftCardRedeemRefusal(cards, s, "GC-4417", 5.01)).toContain("already on this Sale");
  });

  it("sees them on a Held Sale too — a hold's tenders are as unmoved as an Open one's", () => {
    // Found by walking it: the first cut checked Open only, and a $25 card on
    // a Held Sale took $25 and then $11.20 more.
    expect(giftCardAvailable(cards[0], sale([gc(25)], "Held"))).toBe(0);
    expect(giftCardRedeemRefusal(cards, sale([gc(25)], "Held"), "GC-4417", 11.2)).toContain("refused, never clamped");
  });

  it("does not double-count on a Current Sale, whose tenders already moved", () => {
    // E-05 d32: on a Current Sale a tender lands against the balance at once,
    // so the balance already reflects it and subtracting it again would refuse
    // a redemption the card can cover.
    expect(giftCardAvailable(cards[0], sale([gc(20)], "Current"))).toBe(25);
  });

  it("refuses an unknown or unloaded card, pointing at the load path", () => {
    expect(giftCardRedeemRefusal(cards, sale([]), "GC-0000", 1)).toContain("No gift card GC-0000");
    expect(giftCardRedeemRefusal(cards, sale([]), "GC-8890", 1)).toContain("has not been loaded");
    expect(giftCardRedeemRefusal(cards, sale([]), "", 1)).toContain("needs the card's code");
  });
});
