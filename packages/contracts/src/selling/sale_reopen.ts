// sale_reopen — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SaleReopenInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SaleReopenInput = z.infer<typeof SaleReopenInput>;

export const SaleReopenOutput = z.unknown();
export type SaleReopenOutput = z.infer<typeof SaleReopenOutput>;

export const sale_reopen = stub("sale_reopen", SaleReopenInput, SaleReopenOutput);
