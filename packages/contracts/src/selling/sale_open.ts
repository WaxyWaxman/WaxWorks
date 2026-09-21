// sale_open — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SaleOpenInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SaleOpenInput = z.infer<typeof SaleOpenInput>;

export const SaleOpenOutput = z.unknown();
export type SaleOpenOutput = z.infer<typeof SaleOpenOutput>;

export const sale_open = stub("sale_open", SaleOpenInput, SaleOpenOutput);
