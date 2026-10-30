// user_change_role — §6 Identity — O wherever Manager or Owner is the role before or after (M-04 d30)
// Refused where it would leave the Organization with no active Owner (M-04
// d26). A promotion into Manager or Owner needs an email (M-04 d33) and, for
// someone holding a Store with no PIN yet, a PIN (M-04 d35); it sends the
// invite only while the person has never enrolled a passkey — Manager to Owner
// included (M-04 d33, d43; A-117) — and logs a changed email (M-04 d42). It is
// refused for a deactivated person, promotion or demotion (M-04 d44, d46). A demotion to Employee clears the
// PIN and refuses one given (M-04 d39); none leaves an Employee or Manager with
// no Store (M-04 d27).
import { z } from "zod";
import { contract, managerHeader, pin, role } from "../wrapper";

export const UserChangeRoleInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
  p_role: role,
  /** Required on a promotion when the person has none on file (M-04 d33). */
  p_email: z.string().email().nullable(),
  p_pin: pin.nullable(),
}).strict();
export type UserChangeRoleInput = z.infer<typeof UserChangeRoleInput>;

export const UserChangeRoleOutput = z.object({
  user_id: z.string().uuid(),
  invite: z.boolean(),
  /** Where the Server Action sends the invite — given, or already on file; null when `invite` is false (A-118). */
  email: z.string().email().nullable(),
});
export type UserChangeRoleOutput = z.infer<typeof UserChangeRoleOutput>;

export const user_change_role = contract("user_change_role", UserChangeRoleInput, UserChangeRoleOutput);
