import { describe, expect, it } from "vitest";
import { GENRES, PRODUCT_TAX_CODES, SECTIONS } from "../data/seed";
import type { Genre } from "../data/types";
import {
  checkGenreDelete,
  checkGenreWrite,
  genreNameFor,
  sectionCodeFor,
  sectionLabelFor,
  selectableGenres,
} from "./taxonomy";

// M-06 d31, d32 — a Record stores its genre and derives its Section from that
// genre's required parent. These tests exist because the derivation is the
// seam every screen now reads through, and because two of its properties are
// easy to "fix" into bugs later.

describe("deriving a Section from a genre (d31, d32)", () => {
  it("resolves through the genre's required parent", () => {
    expect(sectionCodeFor(GENRES, "gn-folk-rock")).toBe("VI");
    expect(sectionLabelFor(GENRES, SECTIONS, "gn-folk-rock")).toBe("VINYL");
    expect(sectionLabelFor(GENRES, SECTIONS, "gn-books")).toBe("MERCH");
  });

  it("gives every seeded genre a parent Section that exists (d32)", () => {
    const codes = new Set(SECTIONS.map((s) => s.code));
    for (const g of GENRES) {
      expect(codes.has(g.section), `${g.name} -> ${g.section}`).toBe(true);
    }
  });

  it("shows a gap rather than guessing when a genre does not resolve", () => {
    // Deliberately NOT defaulted to a Section. Filing an unresolvable genre
    // under something plausible would hide the one thing worth seeing.
    expect(sectionCodeFor(GENRES, "gn-does-not-exist")).toBeUndefined();
    expect(sectionLabelFor(GENRES, SECTIONS, "gn-does-not-exist")).toBe("—");
    expect(sectionLabelFor(GENRES, SECTIONS, undefined)).toBe("—");
  });
});

describe("genre identity is the id, never the name", () => {
  it("resolves by id and reports the name for display", () => {
    expect(genreNameFor(GENRES, "gn-modal-jazz")).toBe("Modal Jazz");
  });

  it("survives a rename, which is the whole reason ids exist", () => {
    // Renaming used to orphan every Record under the genre: the Section fell
    // to the em dash and the product tax code fell back to the standard one
    // silently. Architecture A-60's merge also needs a pointer to repoint.
    const renamed = GENRES.map((g) => (g.id === "gn-folk-rock" ? { ...g, name: "Folk" } : g));
    expect(genreNameFor(renamed, "gn-folk-rock")).toBe("Folk");
    expect(sectionCodeFor(renamed, "gn-folk-rock")).toBe("VI");
  });

  it("keeps resolving a deactivated genre, and stops offering it (d9)", () => {
    // "Off" means it stops being OFFERED. If the resolvers filtered on active,
    // retiring a genre would change what its existing stock is taxed at.
    const retired = GENRES.map((g) => (g.id === "gn-hip-hop" ? { ...g, active: false } : g));
    expect(sectionCodeFor(retired, "gn-hip-hop")).toBe("VI");
    expect(selectableGenres(retired).some((g) => g.id === "gn-hip-hop")).toBe(false);
  });

  it("never offers a shop-internal genre in a picker (d17, d19)", () => {
    // Omitted rather than gated, so `Freight` is unrepresentable on a music
    // Record instead of merely discouraged.
    const offered = selectableGenres(GENRES).map((g) => g.id);
    expect(offered).not.toContain("gn-freight");
    expect(offered).not.toContain("gn-services");
    expect(offered).not.toContain("gn-gift-card");
    expect(offered).toContain("gn-modal-jazz");
  });
});

describe("the rules a genre write has to satisfy (d12, d32, A-54)", () => {
  const ctx = { genres: GENRES, sections: SECTIONS, productTaxCodes: PRODUCT_TAX_CODES };
  const draft = (over: Partial<Genre> = {}): Genre => ({
    id: "gn-new",
    name: "Dub",
    section: "VI",
    productTaxCode: "1",
    active: true,
    ...over,
  });

  it("accepts a genre with a real parent Section and a real tax code", () => {
    expect(checkGenreWrite(draft(), ctx)).toEqual({ ok: true });
  });

  it("refuses a genre with no parent Section (d32)", () => {
    // A Genre without one leaves every Record beneath it with no Section at
    // all, which nothing downstream can report on.
    expect(checkGenreWrite(draft({ section: "" }), ctx)).toMatchObject({ ok: false });
    expect(checkGenreWrite(draft({ section: "ZZ" }), ctx)).toMatchObject({ ok: false });
  });

  it("refuses a genre with no product tax code (d12, d17)", () => {
    expect(checkGenreWrite(draft({ productTaxCode: "" }), ctx)).toMatchObject({ ok: false });
    expect(checkGenreWrite(draft({ productTaxCode: "9" }), ctx)).toMatchObject({ ok: false });
  });

  it("refuses a duplicate name but lets a genre keep its own", () => {
    expect(checkGenreWrite(draft({ name: "modal jazz" }), ctx)).toMatchObject({ ok: false });
    const existing = GENRES.find((g) => g.id === "gn-modal-jazz")!;
    expect(checkGenreWrite({ ...existing, section: "ME" }, ctx)).toEqual({ ok: true });
  });

  it("refuses deleting a genre that catalog entries carry, and says why (A-54)", () => {
    // Deletion is gated by STATE, not by role, and the refusal has to name its
    // cause — M-04 d13 and A-54 both require that.
    const g = GENRES.find((x) => x.id === "gn-folk-rock")!;
    const refused = checkGenreDelete(g, 3);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain("3 catalog entries");
    expect(checkGenreDelete(g, 0)).toEqual({ ok: true });
    expect(checkGenreDelete(undefined, 0)).toMatchObject({ ok: false });
  });
});

describe("the gift card genre is system-owned (d18)", () => {
  const ctx = { genres: GENRES, sections: SECTIONS, productTaxCodes: PRODUCT_TAX_CODES };
  const giftCard = GENRES.find((g) => g.id === "gn-gift-card")!;

  it("cannot be deleted, even though no catalog entry carries it", () => {
    // This is the trap: the money path references it directly, so the use
    // count A-54 works from is zero and the editor would have offered Delete.
    // Deleting it sends product tax code resolution back to the "1" fallback
    // and silently starts taxing gift card loads again.
    expect(giftCard.systemOwned).toBe(true);
    expect(checkGenreDelete(giftCard, 0)).toMatchObject({ ok: false });
  });

  it("keeps its product tax code, which is what keeps a load out of scope", () => {
    expect(giftCard.productTaxCode).toBe("2");
    expect(checkGenreWrite({ ...giftCard, productTaxCode: "1" }, ctx)).toMatchObject({ ok: false });
  });

  it("can still be renamed and reparented, which move no money", () => {
    expect(checkGenreWrite({ ...giftCard, name: "Gift cards" }, ctx)).toEqual({ ok: true });
  });
});
