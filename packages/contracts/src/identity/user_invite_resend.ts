// user_invite_resend — §6 Identity — O (A-114; M-04 d33; E-01 d35)
// An Owner re-sends the invite to a Manager or Owner who has never enrolled a
// passkey; refused (invalid_state) once users.passkey_enrolled_at is set (A-117).
import { z } from "zod";
import { contract, managerHeader } from "../wrapper";

export const UserInviteResendInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
}).strict();
export type UserInviteResendInput = z.infer<typeof UserInviteResendInput>;

export const UserInviteResendOutput = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
});
export type UserInviteResendOutput = z.infer<typeof UserInviteResendOutput>;

export const user_invite_resend = contract("user_invite_resend", UserInviteResendInput, UserInviteResendOutput);
