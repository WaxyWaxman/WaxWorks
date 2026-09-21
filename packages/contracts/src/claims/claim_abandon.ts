// claim_abandon — §6 Claims; E-04 d24
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const ClaimAbandonInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ClaimAbandonInput = z.infer<typeof ClaimAbandonInput>;

export const ClaimAbandonOutput = z.unknown();
export type ClaimAbandonOutput = z.infer<typeof ClaimAbandonOutput>;

export const claim_abandon = stub("claim_abandon", ClaimAbandonInput, ClaimAbandonOutput);
