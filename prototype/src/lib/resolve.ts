import type { GiftCard, InventoryItem, NonTrackedItem, RecordEntry } from "../data/types";

export type ResolveResult =
  | { kind: "none"; input: string }
  | { kind: "giftcard"; card: GiftCard }
  | { kind: "nontracked"; item: NonTrackedItem }
  | { kind: "internal"; item: InventoryItem; record: RecordEntry }
  | { kind: "upc-single"; item: InventoryItem; record: RecordEntry }
  | { kind: "upc-multi"; record: RecordEntry; items: InventoryItem[] };

// E-05 phase 2 — the barcode field accepts a manufacturer UPC, an internal
// barcode, a GC code, or a non-tracked item code. An internal barcode resolves
// to exactly one InventoryItem; a manufacturer UPC resolves to a Record and,
// when several sellable copies differ, presents a picker.
export function resolveScan(
  raw: string,
  ctx: {
    records: RecordEntry[];
    inventory: InventoryItem[];
    giftCards: GiftCard[];
    nonTracked: NonTrackedItem[];
  },
): ResolveResult {
  const input = raw.trim();
  if (!input) return { kind: "none", input };
  const upper = input.toUpperCase();

  const gc = ctx.giftCards.find((c) => c.code.toUpperCase() === upper);
  if (upper.startsWith("GC") && gc) return { kind: "giftcard", card: gc };

  const nt = ctx.nonTracked.find((n) => n.code.toUpperCase() === upper);
  if (nt) return { kind: "nontracked", item: nt };

  // Internal barcode: GS1 number system 2, 12 digits (PRD §4.3)
  if (/^2\d{11}$/.test(input)) {
    const item = ctx.inventory.find((i) => i.internalBarcode === input);
    if (item) {
      const record = ctx.records.find((r) => r.id === item.recordId)!;
      return { kind: "internal", item, record };
    }
    return { kind: "none", input };
  }

  // Manufacturer UPC -> Record
  const record = ctx.records.find((r) => r.manufacturerUpc === input);
  if (record) {
    const sellable = ctx.inventory.filter(
      (i) => i.recordId === record.id && i.status === "sellable",
    );
    if (sellable.length === 1) return { kind: "upc-single", item: sellable[0], record };
    if (sellable.length > 1) {
      const distinct = new Set(sellable.map((i) => `${i.grade}|${i.price}`));
      if (distinct.size === 1)
        return { kind: "upc-single", item: sellable[0], record };
      return { kind: "upc-multi", record, items: sellable };
    }
    // No sellable copies — still return the record so the till can go negative
    return { kind: "upc-multi", record, items: [] };
  }

  return { kind: "none", input };
}
