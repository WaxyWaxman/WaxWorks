// user_assign — §6 Identity — M, O for a Manager or Owner (M-04 d30)
// Adds a Store to a User's assignments (M-04 d27). Refuses a person with no
// initials (M-04 d34) and a Manager or Owner with no PIN (M-04 d35); refuses an
// initials clash naming the holder and a PIN clash naming nobody, logging the
// latter (M-04 d32). A Manager assigns Employees to their own Stores only.
import { z } from "zod";
import { contract, managerHeader } from "../wrapper";

export const UserAssignInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
  p_store_id: z.string().uuid(),
}).strict();
export type UserAssignInput = z.infer<typeof UserAssignInput>;

export const UserAssignOutput = z.object({ user_id: z.string().uuid() });
export type UserAssignOutput = z.infer<typeof UserAssignOutput>;

export const user_assign = contract("user_assign", UserAssignInput, UserAssignOutput);
