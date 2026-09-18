import type { TaxComponent, TaxGroupCell, TaxType } from "../data/types";

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

// A-63 — liveness is DERIVED. A tax type is live where a cell names it, so
// this is the whole answer to "is this tax being charged", and there is no
// stored flag that could disagree with it. The settings screen reports this
// instead of offering an Active switch.
export function taxTypeUseCount(cells: { spec: string }[], code: string): number {
  return cells.filter((c) => parseCell(c.spec).codes.includes(code)).length;
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
    // No `active` filter: a tax type has none (A-63). A cell naming a type
    // IS what makes it live, so resolution takes whatever the cell names.
    // A code naming no type at all is a broken cell, not a silent zero —
    // it cannot arise from the editor, which only writes letters it has.
    const t = types.find((x) => x.code === code);
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

/**
 * E-02 d53 — **the tax types the store itself pays**, which is not the same
 * list as the tax types it has configured.
 *
 * `tax_types` holds every Canadian tax so that a **group** can be composed per
 * province (M-06 d11, d16): the seeded store carries GST, QST, three HSTs, two
 * PSTs, RST and zero-rated — nine — and pays two of them. Seeding a receiving
 * form from the type list would put nine rows on every invoice; seeding it from
 * the **store's default group** (d14) puts GST and QST on a Quebec one and GST
 * alone on an Alberta one, which is the whole point of the group.
 *
 * Zero-rated types are left out: a supplier does not bill a line for a tax that
 * is zero, so a row for one is a box nobody fills.
 */
export function storeTaxTypes(
  taxTypes: TaxType[],
  cells: TaxGroupCell[],
  defaultGroupId: string,
): TaxType[] {
  const codes = new Set<string>();
  for (const cell of cells) {
    if (cell.groupId !== defaultGroupId) continue;
    for (const code of parseCell(cell.spec).codes) codes.add(code);
  }
  // Type order, not cell order, so the form reads the same way twice running.
  return taxTypes.filter((t) => codes.has(t.code) && (t.ratePpm > 0 || (t.pendingRatePpm ?? 0) > 0));
}

/**
 * What a tax-type write lands as, once [M-06](docs/flows/M-06-settings.md) d52's
 * promotion has been applied.
 *
 * d52: *"where the pending date has already passed, the pending rate is
 * promoted into the current rate before the new one is accepted, so an elapsed
 * change is never silently dropped."*
 *
 * THE DROP THIS EXISTS TO PREVENT. The promotion used to be computed and then
 * immediately undone: `{ ...promoted, ...row }` let the incoming row's
 * `ratePpm` — which the editor always sends, carrying the OLD current rate
 * because the operator did not touch that field — overwrite the rate the
 * promotion had just moved up. Queue 10% for today, let it take effect, then
 * queue 12% for December, and the 10% disappeared: the current rate stayed 5%
 * and no record of the elapsed change survived anywhere. That is precisely the
 * silent drop d52 names.
 *
 * So the promoted rate wins **unless the caller actually edited the rate**,
 * which is the one case their intent is explicit. Comparing against the old
 * current rate is what tells the two apart, since the editor cannot say which
 * field the operator touched.
 */
export function taxTypeWrite(existing: TaxType | undefined, row: TaxType, today: string): TaxType {
  if (!existing) return { ...row };

  const elapsed =
    !!existing.pendingFrom &&
    existing.pendingRatePpm !== undefined &&
    today >= existing.pendingFrom;

  const merged: TaxType = { ...existing, ...row };
  if (!elapsed) return merged;

  // The caller left the current rate alone, so the promotion stands.
  const rateUntouched = row.ratePpm === existing.ratePpm;
  return {
    ...merged,
    ratePpm: rateUntouched ? existing.pendingRatePpm! : row.ratePpm,
    // The promoted pair is consumed either way; what the caller queued next
    // (which may be nothing) is what `row` carries.
    pendingRatePpm: row.pendingRatePpm,
    pendingFrom: row.pendingFrom,
  };
}

/**
 * Has a queued change already taken effect? d52's promotion turns on this.
 *
 * Exported because the Settings editor needs the same answer: it writes the
 * pending **rate** and the pending **date** as two separate saves, and between
 * them the new rate would otherwise be paired with whatever date was there
 * before. Where that old date has elapsed, the half-entered pair reads as *in
 * force right now* and the next save promotes it — so queueing 12% for December
 * on top of an elapsed 10% banked **12%** as the current rate instead of 10%.
 * The operator never typed a current rate at all.
 */
export function pendingHasElapsed(t: Pick<TaxType, "pendingRatePpm" | "pendingFrom">, today: string): boolean {
  return !!t.pendingFrom && t.pendingRatePpm !== undefined && today >= t.pendingFrom;
}
