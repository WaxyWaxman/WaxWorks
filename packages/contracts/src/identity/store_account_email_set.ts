// store_account_email_set — §6 Identity — S (A-90, A-159; O-01 d14, d15, d17)
// A System Administrator corrects the store account email of a Store that has
// no store account yet — Auth refused the one given at Create Store (O-01 d14).
// Refused invalid_state / linked once the Store is linked to an Auth user. Logged
// on the Store and on the Organization, where its Owners read it (O-01 d5, d16;
// S-01 d3). Makes no Auth call: the Owner's store_account_reset then creates the
// account at the corrected address (O-01 d15).
import { z } from "zod";
import { contract, sysadminHeader } from "../wrapper";

export const StoreAccountEmailSetInput = sysadminHeader.extend({
  p_store_id: z.string().uuid(),
  p_store_account_email: z.string().email(),
}).strict();
export type StoreAccountEmailSetInput = z.infer<typeof StoreAccountEmailSetInput>;

export const StoreAccountEmailSetOutput = z.object({
  store_id: z.string().uuid(),
  store_account_email: z.string().email(),
});
export type StoreAccountEmailSetOutput = z.infer<typeof StoreAccountEmailSetOutput>;

export const store_account_email_set = contract("store_account_email_set", StoreAccountEmailSetInput, StoreAccountEmailSetOutput);
