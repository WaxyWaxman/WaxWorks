// claim_void — §6 Claims; A-46, E-04 d27, d29
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const ClaimVoidInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ClaimVoidInput = z.infer<typeof ClaimVoidInput>;

export const ClaimVoidOutput = z.unknown();
export type ClaimVoidOutput = z.infer<typeof ClaimVoidOutput>;

export const claim_void = stub("claim_void", ClaimVoidInput, ClaimVoidOutput);
