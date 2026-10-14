// store_account_reset — §6 Identity — O (M-06 d70; O-01 d3, d6)
// Authorizes and logs rotating a Store's store account; the Server Action then
// sets the new password and signs every terminal of the Store out (A-91). The
// password never reaches this function (conventions §5).
import { z } from "zod";
import { contract, managerHeader } from "../wrapper";

export const StoreAccountResetInput = managerHeader.extend({
  p_store_id: z.string().uuid(),
}).strict();
export type StoreAccountResetInput = z.infer<typeof StoreAccountResetInput>;

export const StoreAccountResetOutput = z.object({
  store_id: z.string().uuid(),
  store_account_email: z.string().email(),
  /** The store account's Auth user, for the Server Action's call; null until auth_user_link. */
  auth_user_id: z.string().uuid().nullable(),
});
export type StoreAccountResetOutput = z.infer<typeof StoreAccountResetOutput>;

export const store_account_reset = contract("store_account_reset", StoreAccountResetInput, StoreAccountResetOutput);
