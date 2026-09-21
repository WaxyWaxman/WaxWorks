// invoice_void — §6 Receiving
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const InvoiceVoidInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type InvoiceVoidInput = z.infer<typeof InvoiceVoidInput>;

export const InvoiceVoidOutput = z.unknown();
export type InvoiceVoidOutput = z.infer<typeof InvoiceVoidOutput>;

export const invoice_void = stub("invoice_void", InvoiceVoidInput, InvoiceVoidOutput);
