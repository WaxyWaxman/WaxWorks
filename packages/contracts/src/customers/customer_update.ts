// customer_update — §6 Customers (A-161; E-07 d13)
// the changed fields only; any Employee (d12).
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are M4's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const CustomerUpdateInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInput>;

export const CustomerUpdateOutput = z.unknown();
export type CustomerUpdateOutput = z.infer<typeof CustomerUpdateOutput>;

export const customer_update = stub("customer_update", CustomerUpdateInput, CustomerUpdateOutput);
