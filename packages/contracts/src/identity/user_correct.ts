// user_correct — §6 Identity — M (M-04 d22, d30, d37)
// Fixes a User's initials, display name or email; omitted fields are
// unchanged. Initials are normalised and must stay unique at every Store the
// person holds (M-04 d13, d20). A Manager corrects an Employee who shares any
// one of their Stores (M-04 d37); a Manager or Owner is corrected by an Owner.
import { z } from "zod";
import { contract, initials, managerHeader } from "../wrapper";

export const UserCorrectInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
  p_initials: initials.optional(),
  p_display_name: z.string().trim().min(1).optional(),
  p_email: z.string().email().nullable().optional(),
}).strict();
export type UserCorrectInput = z.infer<typeof UserCorrectInput>;

export const UserCorrectOutput = z.object({ user_id: z.string().uuid() });
export type UserCorrectOutput = z.infer<typeof UserCorrectOutput>;

export const user_correct = contract("user_correct", UserCorrectInput, UserCorrectOutput);
