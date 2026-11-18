/**
 * One calendar day, written `YYYY-MM-DD`.
 *
 * Every date this app stores is compared as a string — sorted, range-filtered,
 * split into the year/month/day a due date is derived from (E-02 d45). That
 * only works while every stored date is the same shape, so the normalising
 * happens ONCE, where a date is collected, rather than being re-guessed at
 * each of the places that reads one.
 *
 * A date in another shape is not a near-miss here. `"10/09/2026"` sorts before
 * `"2026-01-01"`, so it does not land in the wrong range — it lands in none of
 * them, silently, while still looking like a date on screen.
 */

/** A date that is genuinely `YYYY-MM-DD` and genuinely exists in the calendar. */
export function isCalendarDate(raw: string | undefined | null): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((raw ?? "").trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  // Rejects 31/02 and friends: the constructor rolls them over rather than
  // failing, so the only way to tell is to read the parts back.
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/**
 * The one shape, or nothing.
 *
 * Accepts what is already `YYYY-MM-DD`, and `DD/MM/YYYY`, which is what the
 * desk has been typing and what `docs/lexicon.md` §12 and E-02 d2 call the
 * house format. (Those two say dates normalize to `DD/MM/YYYY` *internally*,
 * which is not what this code did — settled 2026-11-17 by E-02 d58: stored
 * `YYYY-MM-DD`, shown `MM-DD-YYYY` by `showDate` below, entered by a picker.
 * The `DD/MM/YYYY` branch stays for data typed before d58.) Anything else — a half-typed date, a month name, a
 * shape we have never seen — comes back **empty**, because a blank date field
 * reads as blank everywhere, while one holding something uncomparable reads as
 * a date and behaves as nothing.
 *
 * Blank is a legal state for an invoice date: a second-hand intake with no
 * supplier paperwork has no date to copy (E-02 d39).
 */
export function toCalendarDate(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (isCalendarDate(s)) return s;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return isCalendarDate(iso) ? iso : "";
  }
  return "";
}

/**
 * E-02 d58: a date is SHOWN as `MM-DD-YYYY` (`11-17-2026`) on every screen,
 * receipt and printed page — the order it is said aloud — while it stays
 * stored as `YYYY-MM-DD`. Reads the leading calendar day of a date or a
 * timestamp (`2026-09-02 11:00:00`, `2026-09-02T11:00:00`). Blank stays blank;
 * anything that is not a calendar day comes back unchanged, so a bad value is
 * still visible rather than silently hidden.
 */
export function showDate(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const day = s.slice(0, 10);
  if (!isCalendarDate(day)) return s;
  const [y, m, d] = day.split("-");
  return `${m}-${d}-${y}`;
}

/** E-02 d58 for a timestamp: `MM-DD-YYYY HH:MM`, the seconds dropped. A bare date shows as `showDate` does. */
export function showDateTime(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  const date = showDate(s);
  const t = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/.exec(s);
  return t ? `${date} ${t[1]}:${t[2]}` : date;
}
