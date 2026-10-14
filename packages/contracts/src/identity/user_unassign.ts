// user_unassign — §6 Identity — M, O for a Manager or Owner (M-04 d30)
// Removes a Store from a User's assignments. An Employee's or Manager's last
// Store is refused; an Owner may hold none (M-04 d27). A Manager unassigns
// Employees from their own Stores only.
import { z } from "zod";
import { contract, managerHeader } from "../wrapper";

export const UserUnassignInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
  p_store_id: z.string().uuid(),
}).strict();
export type UserUnassignInput = z.infer<typeof UserUnassignInput>;

export const UserUnassignOutput = z.object({ user_id: z.string().uuid() });
export type UserUnassignOutput = z.infer<typeof UserUnassignOutput>;

export const user_unassign = contract("user_unassign", UserUnassignInput, UserUnassignOutput);
