// sale_hold — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SaleHoldInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SaleHoldInput = z.infer<typeof SaleHoldInput>;

export const SaleHoldOutput = z.unknown();
export type SaleHoldOutput = z.infer<typeof SaleHoldOutput>;

export const sale_hold = stub("sale_hold", SaleHoldInput, SaleHoldOutput);
