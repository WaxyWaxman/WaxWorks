// invoice_is_paid — §6; A-33b, A-41 — M3 ships it returning false
// Pure: takes its values as arguments and reads no table (§6).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { stub } from "../wrapper";

export const InvoiceIsPaidInput = z.object({
  invoice_id: z.string().uuid(),
});
export type InvoiceIsPaidInput = z.infer<typeof InvoiceIsPaidInput>;

// §6 line 466: invoice_is_paid(invoice_id) → boolean.
export const InvoiceIsPaidOutput = z.boolean();
export type InvoiceIsPaidOutput = z.infer<typeof InvoiceIsPaidOutput>;

export const invoice_is_paid = stub("invoice_is_paid", InvoiceIsPaidInput, InvoiceIsPaidOutput);
