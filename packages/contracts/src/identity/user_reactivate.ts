// user_reactivate — §6 Identity — M, O for a Manager or Owner
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const UserReactivateInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type UserReactivateInput = z.infer<typeof UserReactivateInput>;

export const UserReactivateOutput = z.unknown();
export type UserReactivateOutput = z.infer<typeof UserReactivateOutput>;

export const user_reactivate = stub("user_reactivate", UserReactivateInput, UserReactivateOutput);
