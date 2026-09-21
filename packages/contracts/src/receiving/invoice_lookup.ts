// invoice_lookup — §6 Receiving
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const InvoiceLookupInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type InvoiceLookupInput = z.infer<typeof InvoiceLookupInput>;

export const InvoiceLookupOutput = z.unknown();
export type InvoiceLookupOutput = z.infer<typeof InvoiceLookupOutput>;

export const invoice_lookup = stub("invoice_lookup", InvoiceLookupInput, InvoiceLookupOutput);
