import { describe, expect, it } from "vitest";
import { GENRES, SECTIONS } from "../data/seed";
import { genreNameFor, sectionCodeFor, sectionLabelFor, selectableGenres } from "./taxonomy";

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
