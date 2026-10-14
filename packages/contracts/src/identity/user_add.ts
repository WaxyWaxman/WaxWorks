// user_add — §6 Identity — M, O for a Manager or Owner (M-04 d30)
// Creates a User with a role, initials and Store assignments (M-04 d27). An
// Employee or Manager holds at least one Store, an Owner any number; whoever
// holds a Store holds initials (M-04 d34), and a Manager or Owner holding one
// holds a PIN (M-04 d35). A Manager or Owner needs an email and is invited
// (M-04 d29); an Employee's email is optional and never invited (M-04 d36).
// A Manager adds Employees at their own Stores only.
import { z } from "zod";
import { contract, initials, managerHeader, pin, role } from "../wrapper";

export const UserAddInput = managerHeader.extend({
  p_display_name: z.string().trim().min(1),
  p_initials: initials.nullable(),
  p_role: role,
  p_email: z.string().email().nullable(),
  p_store_ids: z.array(z.string().uuid()),
  /** The new person's PIN — a Manager's or Owner's who holds a Store (M-04 d35). Never logged (A-93). */
  p_pin: pin.nullable(),
}).strict();
export type UserAddInput = z.infer<typeof UserAddInput>;

export const UserAddOutput = z.object({
  user_id: z.string().uuid(),
  /** True when the Server Action is to send A-91's invite after this commits. */
  invite: z.boolean(),
});
export type UserAddOutput = z.infer<typeof UserAddOutput>;

export const user_add = contract("user_add", UserAddInput, UserAddOutput);
