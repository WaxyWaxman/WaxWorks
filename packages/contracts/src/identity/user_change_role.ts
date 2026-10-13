// user_change_role — §6 Identity — O wherever Manager or Owner is the role before or after (M-04 d30)
// Refused where it would leave the Organization with no active Owner (M-04
// d26). A promotion into Manager or Owner needs an email (M-04 d33) and, for
// someone holding a Store with no PIN yet, a PIN (M-04 d35); it sends the
// invite unless the person already holds a passkey (M-04 d33, A-114).
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
});
export type UserChangeRoleOutput = z.infer<typeof UserChangeRoleOutput>;

export const user_change_role = contract("user_change_role", UserChangeRoleInput, UserChangeRoleOutput);
