// invoice_finalize — §6 Receiving; A-67
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const InvoiceFinalizeInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type InvoiceFinalizeInput = z.infer<typeof InvoiceFinalizeInput>;

export const InvoiceFinalizeOutput = z.unknown();
export type InvoiceFinalizeOutput = z.infer<typeof InvoiceFinalizeOutput>;

export const invoice_finalize = stub("invoice_finalize", InvoiceFinalizeInput, InvoiceFinalizeOutput);
