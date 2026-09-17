import type { AdoptedTag, GenreMapRow, ProviderTag } from "../data/types";

// M-06 d6, d32 — the genre map translates the catalog provider's taxonomy onto
// the shop's genre list. It assigns a **genre and nothing else**: the Section
// follows from that genre's required parent and is never guessed, which is
// what makes d32's guarantee true — an import can put a Record on the wrong
// shelf and cannot put it in the wrong Section.
//
// architecture A-61 sets the resolution order, and A-59 sets who may write a
// row: adding one for a tag that has none is an ungated Employee action,
// while changing one, removing one, or setting a priority is manager-only.

// Tags are untrusted input crossing a trust boundary (A-61). They are matched
// as exact, normalised strings — compared, never interpreted.
export const normaliseTag = (tag: string): string => tag.trim().toLowerCase();

export interface GenreMatch {
  genreId: string;
  /** The tag that actually did the work, as the provider spelled it. */
  matchedTag: string;
}

// A-61 — the matching row with the HIGHEST PRIORITY wins; ties break by the
// provider's vote count; nothing mapped returns undefined and the caller
// prompts (d53).
//
// Priority exists because a vote count measures CONSENSUS, NOT SPECIFICITY:
// broad tags outvote narrow ones on nearly every release, so on votes alone a
// shop's `Shoegaze` would lose to `Rock` forever and the finer genres it
// deliberately created would never auto-fill. Priority defaults to zero, so a
// shop that sets nothing gets plain vote order.
export function resolveGenreFromTags(
  tags: ProviderTag[] | undefined,
  map: GenreMapRow[],
): GenreMatch | undefined {
  if (!tags?.length) return undefined; // d53 — nothing to resolve, and nothing to key a row on

  const byTag = new Map(map.map((r) => [normaliseTag(r.tag), r]));

  const candidates = tags
    .map((t) => ({ tag: t, row: byTag.get(normaliseTag(t.tag)) }))
    .filter((c): c is { tag: ProviderTag; row: GenreMapRow } => Boolean(c.row));

  if (!candidates.length) return undefined;

  candidates.sort(
    (a, b) => (b.row.priority ?? 0) - (a.row.priority ?? 0) || b.tag.votes - a.tag.votes,
  );

  return { genreId: candidates[0].row.genreId, matchedTag: candidates[0].tag.tag };
}

// The tags on a release that no map row covers. This is what the adoption
// prompt offers to write a row against (d53), and — aggregated over the
// catalog — what the Manager's unmapped-tag view reads (A-59), which is a
// derived query rather than a flag anybody has to raise or clear.
export function unmappedTags(tags: ProviderTag[] | undefined, map: GenreMapRow[]): ProviderTag[] {
  if (!tags?.length) return [];
  const known = new Set(map.map((r) => normaliseTag(r.tag)));
  return tags.filter((t) => !known.has(normaliseTag(t.tag)));
}

// A-59 — adding a row for a tag that already has one is refused, because an
// upsert would quietly turn the ungated Employee path into the change path
// and leave the manager-only gate decorative. The refusal is here, in the
// rule, rather than in the screen (A-48's reason).
export type MapWriteCheck = { ok: true } | { ok: false; reason: string };

export function checkMapRowAdd(
  tag: string,
  genreId: string,
  map: GenreMapRow[],
): MapWriteCheck {
  const normalised = normaliseTag(tag);
  if (!normalised) return { ok: false, reason: "A provider tag is required." };
  if (!genreId) return { ok: false, reason: "A genre is required (d17)." };
  const existing = map.find((r) => normaliseTag(r.tag) === normalised);
  if (existing)
    return {
      ok: false,
      reason: `"${tag}" is already mapped. Changing where it points is manager-only (A-59).`,
    };
  return { ok: true };
}

// d17, d32 — shop-internal genres carry NO map rows: nothing a provider
// returns should ever map onto `Gift cards`.
export function mappableGenreIds(genres: { id: string; internal?: boolean; active: boolean }[]): Set<string> {
  return new Set(genres.filter((g) => g.active && !g.internal).map((g) => g.id));
}

// architecture A-59 — THE COMPENSATING MECHANISM, and the reason taking the
// gate off the map is safe rather than merely convenient.
//
// "Tags carried by our Records with no map row" is an ANTI-JOIN against
// `genre_map`, reported with counts and where those Records landed. Derived,
// never stored (§5.1's rule, as A-37 and A-51 apply it): an entry disappears
// the moment the row is written, there is nothing to acknowledge or clear, and
// nothing that can drift out of step with the map.
//
// It is deliberately NOT a flag or a queue. A flag has to be raised by
// somebody and cleared by somebody; this is a question asked of the data.
export interface UnmappedTagReport {
  /** As the provider spelled it, taking the spelling most Records carry. */
  tag: string;
  /** How many adopted Records carry this tag. */
  records: number;
  /** Where those Records actually ended up, commonest first. */
  landedIn: { genreId: string; count: number }[];
}

export function unmappedTagReport(
  records: { genreId: string; providerTags?: AdoptedTag[] }[],
  map: GenreMapRow[],
): UnmappedTagReport[] {
  const known = new Set(map.map((r) => normaliseTag(r.tag)));
  const acc = new Map<string, { spellings: Map<string, number>; genres: Map<string, number> }>();

  for (const rec of records) {
    for (const t of rec.providerTags ?? []) {
      const key = normaliseTag(t.tag);
      if (known.has(key)) continue;
      let entry = acc.get(key);
      if (!entry) {
        entry = { spellings: new Map(), genres: new Map() };
        acc.set(key, entry);
      }
      entry.spellings.set(t.tag, (entry.spellings.get(t.tag) ?? 0) + 1);
      entry.genres.set(rec.genreId, (entry.genres.get(rec.genreId) ?? 0) + 1);
    }
  }

  const commonest = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return [...acc.entries()]
    .map(([, entry]) => ({
      tag: commonest(entry.spellings)[0][0],
      records: [...entry.genres.values()].reduce((n, c) => n + c, 0),
      landedIn: commonest(entry.genres).map(([genreId, count]) => ({ genreId, count })),
    }))
    .sort((a, b) => b.records - a.records || a.tag.localeCompare(b.tag));
}
