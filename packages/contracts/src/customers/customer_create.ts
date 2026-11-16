// customer_create — §6 Customers (A-161; E-07 d18, d30)
// any Employee (d12).
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are M4's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const CustomerCreateInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type CustomerCreateInput = z.infer<typeof CustomerCreateInput>;

export const CustomerCreateOutput = z.unknown();
export type CustomerCreateOutput = z.infer<typeof CustomerCreateOutput>;

export const customer_create = stub("customer_create", CustomerCreateInput, CustomerCreateOutput);
