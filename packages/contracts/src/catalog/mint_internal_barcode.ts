// mint_internal_barcode — §6 Catalog
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const MintInternalBarcodeInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type MintInternalBarcodeInput = z.infer<typeof MintInternalBarcodeInput>;

export const MintInternalBarcodeOutput = z.unknown();
export type MintInternalBarcodeOutput = z.infer<typeof MintInternalBarcodeOutput>;

export const mint_internal_barcode = stub("mint_internal_barcode", MintInternalBarcodeInput, MintInternalBarcodeOutput);
