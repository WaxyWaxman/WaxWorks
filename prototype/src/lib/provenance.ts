import type { Invoice, InvoiceLine, InventoryItem, Supplier } from "../data/types";

/**
 * Where a copy came from — architecture A-45, E-02 d48.
 *
 * A copy is minted from exactly one InvoiceLine, and `invoiceLineId` is that
 * reference. The Invoice is one lookup away and the Supplier two; neither is
 * stored on the item, because a second copy of a fact drifts (A-35, A-20a).
 *
 * What this replaces is the thing worth remembering: the prototype used to
 * carry `arrivedOnInvoice`, a rendered string built at mint as
 * `${supplier.shortName} ${invoiceNumber}`. M-01 d13 makes short name an
 * ordinary card field that saves on change, so renaming a Supplier silently
 * falsified every copy ever received from them — and two recorded decisions,
 * E-02 d36/d43 (a barcode lists the Invoices that took that copy in) and E-04
 * d28 (a claim line defaults to the Invoice its copy arrived on), were being
 * answered by parsing that string back apart.
 *
 * `undefined` is meaningful: the copy was not received on any Invoice. True of
 * an oversold copy minted by a Sale before its paperwork existed (E-02 d21)
 * until E-04 d19 reconciles it — the same fact E-04 d28 states one level up as
 * `{ kind: "none" }`.
 *
 * PROTOTYPE NOTE: `InvoiceLine.itemIds` still records what a line minted, and
 * is a second copy of this link. It survives here for counts on the receiving
 * screen; the schema has no such column (A-45 rejects the array for being the
 * same fact in a shape the database cannot index or constrain). The item side
 * is authoritative — nothing should ask `itemIds` where a copy came from.
 */
export function lineForItem(
  item: InventoryItem,
  invoices: Invoice[],
): { invoice: Invoice; line: InvoiceLine } | undefined {
  if (!item.invoiceLineId) return undefined;
  for (const invoice of invoices) {
    const line = invoice.lines.find((l) => l.id === item.invoiceLineId);
    if (line) return { invoice, line };
  }
  return undefined;
}

export const invoiceForItem = (item: InventoryItem, invoices: Invoice[]): Invoice | undefined =>
  lineForItem(item, invoices)?.invoice;

/** Two joins out. Not stored on the item — see the note above. */
export const supplierIdForItem = (item: InventoryItem, invoices: Invoice[]): string | undefined =>
  invoiceForItem(item, invoices)?.supplierId;

/**
 * "FAB1 55021" — computed at read time, never stored. This is the string the
 * old field held; the difference is that it cannot now be stale, because the
 * short name and the number are read from the rows that own them.
 */
export function provenanceLabel(
  item: InventoryItem,
  invoices: Invoice[],
  suppliers: Supplier[],
): string | undefined {
  const invoice = invoiceForItem(item, invoices);
  if (!invoice) return undefined;
  const supplier = suppliers.find((s) => s.id === invoice.supplierId);
  return `${supplier?.shortName ?? "?"} ${invoice.invoiceNumber}`;
}
