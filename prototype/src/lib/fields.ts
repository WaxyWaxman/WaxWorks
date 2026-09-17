import type { FocusEvent, MouseEvent } from "react";

// Figure fields in this app are almost always REPLACED, not appended to: a
// cost prefilled off a purchase order, a suggested retail, a stated subtotal
// read off the paperwork. Landing in one should hand you the whole value.
//
// onMouseUp is suppressed because a mouse click fires focus first and then
// sets the caret, which would collapse the selection we just made. Keyboard
// focus (Tab) never reaches that handler, so it keeps the selection either
// way.
const selectOnFocus = {
  onFocus: (e: FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
  onMouseUp: (e: MouseEvent<HTMLInputElement>) => e.preventDefault(),
};

// `input[type="number"]` CANNOT be select()ed — the selection API does not
// apply to it, so select-on-focus was silently a no-op and setSelectionRange
// throws there too. A text input with a decimal keypad selects, gets the same
// keyboard on a phone, and drops the spinner buttons that were eating a third
// of every narrow column in the line table.
//
// The trade is that the browser stops validating, which `numericOnly` below
// replaces — coercing garbage to 0 downstream would silently zero a
// supplier's cost, which is exactly the kind of quiet wrong number this screen
// exists to catch.
export const figureField = {
  type: "text" as const,
  inputMode: "decimal" as const,
  autoComplete: "off" as const,
  ...selectOnFocus,
};

/** Same, for a count: no decimal point, no minus. */
export const countField = {
  type: "text" as const,
  inputMode: "numeric" as const,
  autoComplete: "off" as const,
  ...selectOnFocus,
};

/**
 * Keep a figure field to what a figure can contain, as it is typed. Partial
 * input stays valid — "", "12.", "-" are all things a value passes through on
 * the way to being a number, so none of them are rejected.
 */
export function numericOnly(raw: string, allowNegative = false, maxDecimals?: number): string {
  let out = raw.replace(allowNegative ? /[^0-9.-]/g : /[^0-9.]/g, "");
  // One leading minus at most, and only at the front.
  if (allowNegative) {
    const negative = out.startsWith("-");
    out = (negative ? "-" : "") + out.replace(/-/g, "");
  }
  // One decimal point at most; the rest of the digits keep their order.
  const dot = out.indexOf(".");
  if (dot !== -1) out = out.slice(0, dot + 1) + out.slice(dot + 1).replace(/\./g, "");
  // Stop the field at the precision the figure actually has, as it is typed —
  // the extra digits are simply not accepted, rather than accepted and rounded
  // away later where the person who typed them never sees it happen.
  if (maxDecimals !== undefined && dot !== -1) out = out.slice(0, dot + 1 + maxDecimals);
  return out;
}

/**
 * A **cash** figure: the same rules, stopped at two decimal places.
 *
 * Money in this system is a whole number of minor units ([architecture](../../../docs/architecture.md)
 * A-15), and every total is rounded to two ([totals.ts](totals.ts)'s `round2`,
 * A-47's half-away-from-zero). A field that accepts `125.11111` is therefore
 * accepting something the system cannot store: it rounds somewhere downstream,
 * silently, and the figure on the invoice stops matching the figure on the
 * paper. Refusing the third decimal at the keystroke is the version the person
 * entering it can see.
 *
 * **Rates are not money and do not use this** — A-47 keeps tax rates in parts
 * per million precisely because QST is 9.975%, and a supplier discount is a
 * percentage rather than a cash amount.
 *
 * *Assumes two decimals for every currency.* True of CAD and USD, which is what
 * M-06 configures; a zero-decimal currency would need this to read the
 * currency's own precision.
 */
export const moneyOnly = (raw: string, allowNegative = false): string =>
  numericOnly(raw, allowNegative, 2);

/** Digits only — a quantity has no fractional part. */
export function integerOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}
