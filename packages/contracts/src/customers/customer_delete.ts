// customer_delete — §6 Customers (A-161, A-54, A-153; E-07 d32–d35)
// refused while a live reference stands.
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are M4's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const CustomerDeleteInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type CustomerDeleteInput = z.infer<typeof CustomerDeleteInput>;

export const CustomerDeleteOutput = z.unknown();
export type CustomerDeleteOutput = z.infer<typeof CustomerDeleteOutput>;

export const customer_delete = stub("customer_delete", CustomerDeleteInput, CustomerDeleteOutput);
