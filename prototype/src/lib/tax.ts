import type { TaxType } from "../data/types";

// M-06's tax model, as pure functions.
//
// Tax resolves from TWO AXES THAT NEVER COMPETE (d14): who the customer is —
// their tax group, else the store's default — and what the product is — the
// Genre's product tax code. Neither overrides the other; they are the two
// coordinates of one lookup, and the cell at that coordinate names the taxes.
//
// This replaces the flat "one rate per named line" the prototype carried,
// which was M-06 d1 and has been superseded since d11. The blend it encoded
// (`QC 14.975%` for GST 5% + QST 9.975%) is the exact thing two tables exist
// to stop: a blend cannot be reported per type (M-03 d13), cannot carry a
// registration number per type (d48), and cannot be split by rate when a
// period spans a rate change (M-03 d15).

// A-47 — a rate is an integer of PARTS PER MILLION, because QST is 9.975% and
// basis points could not hold it. 99750 ppm is QST; 50000 is GST.
export const PPM = 1_000_000;

// A-47 — rounded HALF AWAY FROM ZERO, applied once per tax.
//
// Not Math.round, which is half-UP: Math.round(-2.505 * 100) / 100 gives
// -2.50 where away-from-zero gives -2.51. The difference only shows on
// negative amounts, which is to say on Returns (E-06 d1) — and A-49 names
// exactly that case as the reason the whole money path uses one rule, so a
// refund rounds symmetrically to the sale that produced it.
export function roundHalfAwayFromZero(n: number): number {
  const cents = n * 100;
  // 1e-9 absorbs the float error that makes 2.675 * 100 land at 267.49999997.
  const rounded = Math.sign(cents) * Math.round(Math.abs(cents) + 1e-9);
  return rounded / 100;
}

// A-58 — the rate in force AT a moment. A type carries its current rate plus
// an optional pending one and the date it starts (M-06 d52), so the rate is a
// function of time rather than a column anybody may read directly.
export function taxRateAt(type: TaxType, at: string): number {
  const ppm =
    type.pendingFrom && type.pendingRatePpm !== undefined && at >= type.pendingFrom
      ? type.pendingRatePpm
      : type.ratePpm;
  return ppm / PPM;
}

// d16 — a cell names ONE OR TWO tax type letters, or is blank. A trailing `+`
// makes the second tax compound on the first.
//
//   ""     out of scope for this pair — no tax, nothing reportable (d15)
//   "a"    tax a only
//   "ab"   a and b, both on the line subtotal
//   "ab+"  a on the subtotal, then b on subtotal PLUS a
export interface ParsedCell {
  codes: string[];
  compound: boolean;
}

export function parseCell(spec: string): ParsedCell {
  const raw = (spec ?? "").trim();
  const compound = raw.endsWith("+");
  const codes = (compound ? raw.slice(0, -1) : raw).split("").filter((c) => c.trim());
  return { codes: codes.slice(0, 2), compound };
}

export interface TaxComponent {
  code: string;
  name: string;
  ratePpm: number; // the rate ACTUALLY applied, snapshotted by the caller
  amount: number;
}

// The line's tax, one entry per tax type applied.
//
// Returns COMPONENTS rather than a total on purpose: A-57 and §5 snapshot "the
// tax types resolved and the rates applied" onto the Sale line, never a
// reference to a configuration row, and M-03 reports per type (d13) and splits
// by rate (d15). A single number would throw away everything both of those
// need, which is how the flat model painted itself into a corner.
export function resolveLineTax(
  net: number,
  cellSpec: string,
  types: TaxType[],
  at: string,
): TaxComponent[] {
  const { codes, compound } = parseCell(cellSpec);
  if (!codes.length) return []; // d15 — a blank cell is out of scope, not zero-rated

  const out: TaxComponent[] = [];
  let first = 0;
  codes.forEach((code, i) => {
    const t = types.find((x) => x.code === code && x.active);
    if (!t) return;
    const rate = taxRateAt(t, at);
    // d16 — each tax is rounded to the cent AS IT IS APPLIED, not at the end.
    // The worked example turns on this: the fifteen cents between `ab` and
    // `ab+` is the evaluation order, and nothing normalises it away.
    const base = i === 1 && compound ? net + first : net;
    const amount = roundHalfAwayFromZero(base * rate);
    if (i === 0) first = amount;
    out.push({ code: t.code, name: t.name, ratePpm: Math.round(rate * PPM), amount });
  });
  return out;
}

export const taxTotal = (components: TaxComponent[]): number =>
  roundHalfAwayFromZero(components.reduce((n, c) => n + c.amount, 0));

// d14 — the resolution order, in one place so no caller invents its own.
// The Customer's tax group, else the store's default; the Genre's product tax
// code; then the (group, code) cell.
export function cellFor(
  cells: { groupId: string; productTaxCode: string; spec: string }[],
  groupId: string,
  productTaxCode: string,
): string {
  return cells.find((c) => c.groupId === groupId && c.productTaxCode === productTaxCode)?.spec ?? "";
}
