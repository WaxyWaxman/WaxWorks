// invoice_add_line — §6 Receiving
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const InvoiceAddLineInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type InvoiceAddLineInput = z.infer<typeof InvoiceAddLineInput>;

export const InvoiceAddLineOutput = z.unknown();
export type InvoiceAddLineOutput = z.infer<typeof InvoiceAddLineOutput>;

export const invoice_add_line = stub("invoice_add_line", InvoiceAddLineInput, InvoiceAddLineOutput);
