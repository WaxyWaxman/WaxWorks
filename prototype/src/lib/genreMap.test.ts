import { describe, expect, it } from "vitest";
import { GENRE_MAP, GENRES } from "../data/seed";
import type { GenreMapRow, ProviderTag } from "../data/types";
import {
  checkMapRowAdd,
  mappableGenreIds,
  normaliseTag,
  resolveGenreFromTags,
  unmappedTags,
} from "./genreMap";

const tag = (t: string, votes: number): ProviderTag => ({ tag: t, votes });

describe("resolving a genre from provider tags (A-61)", () => {
  it("takes the highest-voted tag that has a map row", () => {
    const hit = resolveGenreFromTags([tag("Jazz", 40), tag("Folk", 3)], GENRE_MAP);
    expect(hit).toEqual({ genreId: "gn-modal-jazz", matchedTag: "Jazz" });
  });

  it("skips tags with no row rather than giving up on the release", () => {
    // A release tagged with something we have never seen still resolves, as
    // long as one of its other tags is mapped.
    const hit = resolveGenreFromTags([tag("Slowcore", 90), tag("Folk", 2)], GENRE_MAP);
    expect(hit).toEqual({ genreId: "gn-folk-rock", matchedTag: "Folk" });
  });

  it("lets priority beat the vote count, which is the reason it exists", () => {
    // Votes measure CONSENSUS, not specificity: `rock` outvotes `shoegaze` on
    // nearly every shoegaze release. Without priority a shop's finer genres
    // would never auto-fill and the rows it made deliberately would be dead.
    const tags = [tag("Rock", 500), tag("Shoegaze", 4)];
    expect(resolveGenreFromTags(tags, GENRE_MAP)?.matchedTag).toBe("Shoegaze");

    // Strip the priority and the heavily-voted broad tag wins again.
    const flat: GenreMapRow[] = GENRE_MAP.map((r) => ({ ...r, priority: 0 }));
    expect(resolveGenreFromTags(tags, flat)?.matchedTag).toBe("Rock");
  });

  it("matches tags as normalised strings, never interpreting them", () => {
    // Untrusted input crossing a trust boundary (A-61).
    expect(resolveGenreFromTags([tag("  HIP HOP  ", 5)], GENRE_MAP)?.genreId).toBe("gn-hip-hop");
    expect(normaliseTag("  Art Punk ")).toBe("art punk");
  });

  it("returns nothing for an unmapped tag, and nothing for no tags at all", () => {
    // d53 — both prompt, and they are ONE path. The only difference is that a
    // release with no tags has nothing to key a map row on.
    expect(resolveGenreFromTags([tag("Shoegaze-adjacent", 9)], GENRE_MAP)).toBeUndefined();
    expect(resolveGenreFromTags([], GENRE_MAP)).toBeUndefined();
    expect(resolveGenreFromTags(undefined, GENRE_MAP)).toBeUndefined();
  });
});

describe("what the prompt can offer to map (d53)", () => {
  it("names the tags no row covers", () => {
    const tags = [tag("Rock", 50), tag("Krautrock", 7)];
    expect(unmappedTags(tags, GENRE_MAP).map((t) => t.tag)).toEqual(["Krautrock"]);
  });

  it("offers nothing where the release carried no tags", () => {
    expect(unmappedTags(undefined, GENRE_MAP)).toEqual([]);
    expect(unmappedTags([], GENRE_MAP)).toEqual([]);
  });
});

describe("who may write a row (A-59)", () => {
  it("accepts a row for a tag that has none", () => {
    expect(checkMapRowAdd("Krautrock", "gn-art-punk", GENRE_MAP)).toEqual({ ok: true });
  });

  it("refuses a tag that is already mapped, so add cannot become change", () => {
    // An upsert would quietly turn the ungated Employee path into the change
    // path and leave the manager-only gate decorative (A-59, A-48).
    const refused = checkMapRowAdd("rock", "gn-modal-jazz", GENRE_MAP);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain("manager-only");
    expect(checkMapRowAdd("ROCK", "gn-modal-jazz", GENRE_MAP).ok).toBe(false);
  });

  it("requires both a tag and a genre", () => {
    expect(checkMapRowAdd("  ", "gn-art-punk", GENRE_MAP).ok).toBe(false);
    expect(checkMapRowAdd("Krautrock", "", GENRE_MAP).ok).toBe(false);
  });
});

describe("the seeded map (d17, d32, A-53)", () => {
  it("never points at a shop-internal genre", () => {
    // Nothing a provider returns should ever map onto `Gift cards` (d17).
    const mappable = mappableGenreIds(GENRES);
    for (const row of GENRE_MAP) {
      expect(mappable.has(row.genreId), `${row.tag} -> ${row.genreId}`).toBe(true);
    }
  });

  it("points every row at a genre that exists", () => {
    const ids = new Set(GENRES.map((g) => g.id));
    for (const row of GENRE_MAP) {
      expect(ids.has(row.genreId), row.tag).toBe(true);
    }
  });

  it("holds each tag once, normalised", () => {
    const seen = GENRE_MAP.map((r) => normaliseTag(r.tag));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(GENRE_MAP.map((r) => r.tag));
  });
});
