// invoice_open — §6 Receiving
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const InvoiceOpenInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type InvoiceOpenInput = z.infer<typeof InvoiceOpenInput>;

export const InvoiceOpenOutput = z.unknown();
export type InvoiceOpenOutput = z.infer<typeof InvoiceOpenOutput>;

export const invoice_open = stub("invoice_open", InvoiceOpenInput, InvoiceOpenOutput);
