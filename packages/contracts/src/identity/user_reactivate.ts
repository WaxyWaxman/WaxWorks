// user_reactivate — §6 Identity — M, O for a Manager or Owner (M-04 d30)
// Restores the original row (M-04 d19). Where the person's initials have been
// reused at any of their Stores it refuses with initials_clash, and the screen
// asks for new ones (p_initials). A Manager reactivates an Employee who shares
// any one of their Stores (M-04 d37).
import { z } from "zod";
import { contract, initials, managerHeader } from "../wrapper";

export const UserReactivateInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
  /** New initials, where theirs were reused while they were away (M-04 d19). */
  p_initials: initials.nullable(),
}).strict();
export type UserReactivateInput = z.infer<typeof UserReactivateInput>;

export const UserReactivateOutput = z.object({ user_id: z.string().uuid() });
export type UserReactivateOutput = z.infer<typeof UserReactivateOutput>;

export const user_reactivate = contract("user_reactivate", UserReactivateInput, UserReactivateOutput);
