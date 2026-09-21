// sale_update_line — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SaleUpdateLineInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SaleUpdateLineInput = z.infer<typeof SaleUpdateLineInput>;

export const SaleUpdateLineOutput = z.unknown();
export type SaleUpdateLineOutput = z.infer<typeof SaleUpdateLineOutput>;

export const sale_update_line = stub("sale_update_line", SaleUpdateLineInput, SaleUpdateLineOutput);
