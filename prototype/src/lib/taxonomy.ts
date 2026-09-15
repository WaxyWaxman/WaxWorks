import type { Genre, SectionRow } from "../data/types";

// M-06 d31, d32 — a catalog entry stores its GENRE and nothing its genre
// already implies. A Record's Section is derived through the genre's required
// parent; it is never stored beside it.
//
// The prototype used to carry both `genre` and `section` on a Record, which is
// the same fact at two removes and drifts the moment a genre is remapped —
// refused for architecture A-35's reason and d31's. So this module is the only
// way to get a Record's Section, and it is a lookup rather than a field.
// Correcting a genre corrects the Section beneath it at once, which is the
// whole point of configuration (d31).
//
// Completed Sale lines are unaffected by any of this: they keep what they
// resolved (M-06 d8, architecture A-57). Nothing here is read by the money
// path — tax resolves through the genre's product tax code (d12), not through
// the Section.

// By ID. A Record points at the genre's stable key, never at its label, so a
// Manager renaming `Metal` moves nothing beneath it.
//
// Deliberately does NOT filter on `active`. d9 deactivates a referenced Genre
// rather than deleting it, and "off" means it stops being OFFERED — a Record
// already under a retired genre must keep resolving, or its Section falls to
// the em dash and its product tax code falls back to the standard one. The
// pickers filter; the resolvers do not.
export function genreFor(genres: Genre[], genreId: string | undefined): Genre | undefined {
  if (!genreId) return undefined;
  return genres.find((g) => g.id === genreId);
}

// The label a screen shows for a Record's genre.
export function genreNameFor(genres: Genre[], genreId: string | undefined): string {
  return genreFor(genres, genreId)?.name ?? "—";
}

// What a picker offers: active, and never the shop-internal genres, which d19
// omits rather than gates so `Freight` is unrepresentable instead of merely
// discouraged.
export function selectableGenres(genres: Genre[]): Genre[] {
  return genres.filter((g) => g.active && !g.internal);
}

// The Section code a genre rolls up into, or `undefined` when the genre is not
// in the table.
//
// Deliberately NOT defaulted. d32 makes the parent Section required *on a
// Genre*, so a Record whose genre resolves to nothing is a data problem, and
// quietly filing it under `VI` would hide the single thing worth seeing. The
// tax path makes the opposite call for the opposite reason — an unresolvable
// genre there falls back to the standard code, because charging no tax is a
// worse failure than charging the wrong one. Here there is no equivalent
// danger, so the gap is shown.
export function sectionCodeFor(genres: Genre[], genreId: string | undefined): string | undefined {
  return genreFor(genres, genreId)?.section;
}

export function sectionRowFor(
  genres: Genre[],
  sections: SectionRow[],
  genreId: string | undefined,
): SectionRow | undefined {
  const code = sectionCodeFor(genres, genreId);
  return code ? sections.find((s) => s.code === code) : undefined;
}

// What a screen shows where a Section is expected. An em dash rather than a
// guess, for the reason above.
//
// The NAME, not the code. A Record used to store `VINYL` directly while a
// Genre stores the code `VI` (d28's two-character field), so deriving moves
// every display through the Section table — which is the point: the label a
// screen shows is now the one a Manager typed, and renaming a Section renames
// it everywhere at once rather than in the rows written since.
export function sectionLabelFor(
  genres: Genre[],
  sections: SectionRow[],
  genreId: string | undefined,
): string {
  return sectionRowFor(genres, sections, genreId)?.name ?? "—";
}

// What a Section search should match: the code and the name both, since one is
// what the shop files under and the other is what it says out loud.
export function sectionSearchTerms(
  genres: Genre[],
  sections: SectionRow[],
  genreId: string | undefined,
): string {
  const row = sectionRowFor(genres, sections, genreId);
  return row ? `${row.code} ${row.name}` : "";
}
