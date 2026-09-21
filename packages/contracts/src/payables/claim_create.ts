// claim_create — §6 Payables
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ClaimCreateInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ClaimCreateInput = z.infer<typeof ClaimCreateInput>;

export const ClaimCreateOutput = z.unknown();
export type ClaimCreateOutput = z.infer<typeof ClaimCreateOutput>;

export const claim_create = stub("claim_create", ClaimCreateInput, ClaimCreateOutput);
