import { toCalendarDate } from "./calendarDate";

// E-02 d39, as amended by A-152 — `SH<position>-YYMMDD-n` for a second-hand
// intake with no supplier paperwork. The Store's position leads the reference
// (unpadded), so two Stores of one Organization never mint the same value
// against the one second-hand Supplier; `-n` sequences that Store's intakes on
// the received date. Takes the received date as one calendar day; anything
// unparseable falls back to today, because a reference that exists beats a
// blank one.
export function mintSecondHandRef(position: number, receivedDate: string, takenNumbers: string[]): string {
  const iso = toCalendarDate(receivedDate) || new Date().toLocaleDateString("en-CA");
  const [y, m, d] = iso.split("-");
  const stem = `SH${position}-${y.slice(2)}${m}${d}`;
  // Sequence against what already exists for that day rather than a counter,
  // so the number cannot drift from the references actually on file. Only this
  // Store's references are passed in, and the stem carries its position, so
  // `SH1-` and `SH12-` never count each other (the `-` closes the prefix).
  const taken = takenNumbers.filter((n) => n.startsWith(stem + "-")).length;
  return `${stem}-${taken + 1}`;
}
