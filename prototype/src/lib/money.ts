export const money = (n: number): string =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

// A-49 / M-06 d44 (E-02 d55, E-04 d31) — a shelf price SUGGESTION rounds to
// the NEAREST instance of the store's one configured price ending, up or down,
// ties away from zero. `endingMinor` is the setting as M-06 holds it: an
// integer of minor units — 99, 95, 0 — so `.00` is representable and nothing
// here parses a display format. The helper takes the ending as an argument
// rather than reading the setting, because a pure helper that reads a table
// is not one (architecture §6). This replaced `roundUpShelf`, which was E-02
// d9's two endings, always up.
export function roundToEnding(n: number, endingMinor: number): number {
  if (n <= 0) return 0;
  const minor = Math.round(n * 100);
  const e = ((Math.round(endingMinor) % 100) + 100) % 100;
  const base = Math.floor(minor / 100) * 100;
  let best = -1;
  for (const c of [base - 100 + e, base + e, base + 100 + e]) {
    if (c < 0) continue;
    if (best < 0) { best = c; continue; }
    const d = Math.abs(c - minor);
    const bd = Math.abs(best - minor);
    // Nearest; on a tie the larger (away from zero), matching A-47's mode.
    if (d < bd || (d === bd && c > best)) best = c;
  }
  return best / 100;
}

export const pct = (n: number): string => `${n}%`;
