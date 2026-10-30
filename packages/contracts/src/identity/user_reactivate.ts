// user_reactivate — §6 Identity — M, O for a Manager or Owner (M-04 d30)
// Restores the original row (M-04 d19). Where the person's initials have been
// reused at any of their Stores it refuses with initials_clash, and the screen
// asks for new ones (p_initials). Likewise a Manager's or Owner's PIN given to
// someone else at one of their Stores: it refuses pin_clash, unnamed and logged,
// and the screen asks for a new one (p_pin, M-04 d40) — only then (M-04 d47). It
// is refused for someone already active (M-04 d47). A Manager reactivates an
// Employee who shares any one of their Stores (M-04 d37).
import { z } from "zod";
import { contract, initials, managerHeader, pin } from "../wrapper";

export const UserReactivateInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
  /** New initials, where theirs were reused while they were away (M-04 d19). */
  p_initials: initials.nullable(),
  /** A new PIN, where theirs was given to someone else while they were away (M-04 d40). Never logged (A-93). */
  p_pin: pin.nullable(),
}).strict();
export type UserReactivateInput = z.infer<typeof UserReactivateInput>;

export const UserReactivateOutput = z.object({ user_id: z.string().uuid() });
export type UserReactivateOutput = z.infer<typeof UserReactivateOutput>;

export const user_reactivate = contract("user_reactivate", UserReactivateInput, UserReactivateOutput);
