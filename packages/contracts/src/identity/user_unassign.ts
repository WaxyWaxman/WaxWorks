// user_unassign — §6 Identity — M, O for a Manager or Owner
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const UserUnassignInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type UserUnassignInput = z.infer<typeof UserUnassignInput>;

export const UserUnassignOutput = z.unknown();
export type UserUnassignOutput = z.infer<typeof UserUnassignOutput>;

export const user_unassign = stub("user_unassign", UserUnassignInput, UserUnassignOutput);
