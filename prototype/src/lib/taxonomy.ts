import type { Genre, ProductTaxCode, SectionRow } from "../data/types";

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

// ---------------------------------------------------------------------------
// The rules a genre write has to satisfy, as pure functions so they can be
// exercised without a screen. architecture §6 makes the same argument for the
// pricing helpers: the rules are the highest-value thing to test.
// ---------------------------------------------------------------------------

export type GenreWriteCheck = { ok: true } | { ok: false; reason: string };

export function checkGenreWrite(
  row: Genre,
  ctx: { genres: Genre[]; sections: SectionRow[]; productTaxCodes: ProductTaxCode[] },
): GenreWriteCheck {
  const name = row.name.trim();
  if (!name) return { ok: false, reason: "A name is required." };

  // d32 — the parent Section is REQUIRED, and it is what lets a Record derive
  // its Section rather than store one (d31). A Genre without one would leave
  // every Record beneath it with no Section at all, which nothing downstream
  // can report on.
  if (!row.section) return { ok: false, reason: "A parent Section is required (d32)." };
  if (!ctx.sections.some((x) => x.code === row.section))
    return { ok: false, reason: `No Section with code ${row.section}.` };

  // d12 — the product tax code is carried by the Genre, so it decides the tax
  // on every line beneath it. d17 makes genre mandatory on every sellable
  // thing, which makes this mandatory here.
  if (!row.productTaxCode) return { ok: false, reason: "A product tax code is required (d12)." };
  if (!ctx.productTaxCodes.some((x) => x.code === row.productTaxCode))
    return { ok: false, reason: `No product tax code ${row.productTaxCode}.` };

  // d18 — a system-owned genre keeps its product tax code. The gift card
  // load resolves through it, and code `2` is what keeps a load out of scope
  // (d15); editing it here would start taxing loads with nothing to say so.
  const before = ctx.genres.find((x) => x.id === row.id);
  if (before?.systemOwned && before.productTaxCode !== row.productTaxCode)
    return {
      ok: false,
      reason: `${before.name} is written by the system (d18) — its product tax code cannot be changed.`,
    };

  const clash = ctx.genres.find(
    (x) => x.id !== row.id && x.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) return { ok: false, reason: `${clash.name} already uses that name.` };

  return { ok: true };
}

// A-54 — deletion is gated by STATE, not by role: refused while live
// references exist, and it never removes a historical row. d9's deactivation
// is the alternative and is always available. The refusal names its cause,
// because M-04 d13 and A-54 both require a refusal to say what blocked it.
export function checkGenreDelete(
  genre: Genre | undefined,
  useCount: number,
): GenreWriteCheck {
  if (!genre) return { ok: false, reason: "No such genre." };
  // Referenced by the money path rather than by the catalog, so the count
  // below cannot see it (d18).
  if (genre.systemOwned)
    return { ok: false, reason: `${genre.name} is written by the system (d18) — it cannot be deleted.` };
  if (useCount > 0)
    return {
      ok: false,
      reason: `${genre.name} is carried by ${useCount} catalog ${
        useCount === 1 ? "entry" : "entries"
      } (A-54). Deactivate it instead, or merge it into another genre.`,
    };
  return { ok: true };
}

// A-60 - what a merge refuses. Manager-only is enforced by the screen being
// manager-only (A-28a); these are the rules that hold regardless of who asks.
export function checkGenreMerge(
  from: Genre | undefined,
  to: Genre | undefined,
): GenreWriteCheck {
  if (!from || !to) return { ok: false, reason: "Both genres must exist." };
  if (from.id === to.id) return { ok: false, reason: "A genre cannot be merged into itself." };
  // d18 - the money path resolves a gift card load through this genre, so
  // merging it away would send that resolution to the standard-code fallback.
  if (from.systemOwned)
    return {
      ok: false,
      reason: `${from.name} is written by the system (d18) — it cannot be merged away.`,
    };
  return { ok: true };
}
