// user_set_pin — §6 Identity — M (M-04 d28, d30, d35)
// Sets, changes or clears a Manager's or Owner's four-digit PIN. Unique among
// the Managers and Owners assigned to each of the holder's Stores; a clash is
// refused naming nobody and logged (M-04 d32). Clearing the PIN of someone who
// holds a Store is refused (M-04 d35). Logged as changed, never as a value.
import { z } from "zod";
import { contract, managerHeader, pin } from "../wrapper";

export const UserSetPinInput = managerHeader.extend({
  p_user_id: z.string().uuid(),
  /** Null clears it. Never logged, never in a refusal (A-93). */
  p_pin: pin.nullable(),
}).strict();
export type UserSetPinInput = z.infer<typeof UserSetPinInput>;

export const UserSetPinOutput = z.object({ user_id: z.string().uuid() });
export type UserSetPinOutput = z.infer<typeof UserSetPinOutput>;

export const user_set_pin = contract("user_set_pin", UserSetPinInput, UserSetPinOutput);
