// user_set_pin — §6 Identity; M-04 d28, d30
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const UserSetPinInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type UserSetPinInput = z.infer<typeof UserSetPinInput>;

export const UserSetPinOutput = z.unknown();
export type UserSetPinOutput = z.infer<typeof UserSetPinOutput>;

export const user_set_pin = stub("user_set_pin", UserSetPinInput, UserSetPinOutput);
