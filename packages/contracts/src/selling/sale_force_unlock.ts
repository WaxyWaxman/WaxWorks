// sale_force_unlock — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SaleForceUnlockInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SaleForceUnlockInput = z.infer<typeof SaleForceUnlockInput>;

export const SaleForceUnlockOutput = z.unknown();
export type SaleForceUnlockOutput = z.infer<typeof SaleForceUnlockOutput>;

export const sale_force_unlock = stub("sale_force_unlock", SaleForceUnlockInput, SaleForceUnlockOutput);
