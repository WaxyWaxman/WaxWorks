// customer_merge — §6 Customers (A-161; E-07 d28, d41)
// the absorbed record deleted, its trace naming the survivor.
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are M4's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const CustomerMergeInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type CustomerMergeInput = z.infer<typeof CustomerMergeInput>;

export const CustomerMergeOutput = z.unknown();
export type CustomerMergeOutput = z.infer<typeof CustomerMergeOutput>;

export const customer_merge = stub("customer_merge", CustomerMergeInput, CustomerMergeOutput);
