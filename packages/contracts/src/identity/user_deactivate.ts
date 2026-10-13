// user_deactivate — §6 Identity — M, O for a Manager or Owner (M-04 d30)
// Removes access at the write path at once (M-04 d15, d18) and releases the
// initials (M-04 d16). A Manager deactivates an Employee who shares any one of
// their Stores (M-04 d37). Refused where it would leave the Organization with no
// active Owner (M-04 d26). Never a delete (M-04 d5).
import { z } from "zod";
import { contract, managerHeader } from "../wrapper";

export const UserDeactivateInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
}).strict();
export type UserDeactivateInput = z.infer<typeof UserDeactivateInput>;

export const UserDeactivateOutput = z.object({ user_id: z.string().uuid() });
export type UserDeactivateOutput = z.infer<typeof UserDeactivateOutput>;

export const user_deactivate = contract("user_deactivate", UserDeactivateInput, UserDeactivateOutput);
