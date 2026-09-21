// sale_edit — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SaleEditInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SaleEditInput = z.infer<typeof SaleEditInput>;

export const SaleEditOutput = z.unknown();
export type SaleEditOutput = z.infer<typeof SaleEditOutput>;

export const sale_edit = stub("sale_edit", SaleEditInput, SaleEditOutput);
