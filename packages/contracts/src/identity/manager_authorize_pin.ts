// manager_authorize_pin — §6 Identity; A-89, A-113; E-01 d26, d31, d32
// A header exception (A-113): the PIN pad's own check. Returns the one active
// Manager or Owner assigned to auth.store_id() holding this PIN, or refuses
// naming nobody. A lookup that opens an area and authorizes no write — every
// M / O function resolves the PIN again (E-01 d32). Its refusals count toward
// the Store's limit of five in fifteen minutes (E-01 d31). Store session only.
// A-120: it also takes the staff session's actor, null together when none is
// open; verified when given, recorded on a refused PIN's row, and never what
// the PIN resolves to — the PIN alone decides whom it names.
import { z } from "zod";
import { contract, initials, pin, role } from "../wrapper";

export const ManagerAuthorizePinInput = z.strictObject({
  p_pin: pin,
  p_terminal_id: z.string().uuid(),
  p_actor_user_id: z.string().uuid().nullable(),
  p_actor_initials: initials.nullable(),
}).refine((v) => (v.p_actor_user_id === null) === (v.p_actor_initials === null), {
  error: "the staff session's actor and initials are given together, or neither (A-120)",
});
export type ManagerAuthorizePinInput = z.infer<typeof ManagerAuthorizePinInput>;

export const ManagerAuthorizePinOutput = z.object({
  user_id: z.string().uuid(),
  display_name: z.string(),
  role: role.exclude(["employee"]),
});
export type ManagerAuthorizePinOutput = z.infer<typeof ManagerAuthorizePinOutput>;

export const manager_authorize_pin = contract("manager_authorize_pin", ManagerAuthorizePinInput, ManagerAuthorizePinOutput);
