// user_reset_request — §6 Identity — O (A-114; M-04 d29, d38)
// An Owner sends a Manager or Owner a re-enrolment link for a lost passkey. The
// function authorizes and logs *link sent*; the Server Action makes the Auth
// call after it commits (A-91). Never the link in the log (A-93).
import { z } from "zod";
import { contract, managerHeader } from "../wrapper";

export const UserResetRequestInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
}).strict();
export type UserResetRequestInput = z.infer<typeof UserResetRequestInput>;

export const UserResetRequestOutput = z.object({
  user_id: z.string().uuid(),
  /** Where the Server Action sends the link. */
  email: z.string().email(),
});
export type UserResetRequestOutput = z.infer<typeof UserResetRequestOutput>;

export const user_reset_request = contract("user_reset_request", UserResetRequestInput, UserResetRequestOutput);
