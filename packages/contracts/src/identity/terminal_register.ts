// terminal_register — §6 Identity; A-87, A-94, A-113
// A header exception (A-113): a browser on a store session names itself. It
// takes no p_terminal_id — it mints the id every later call carries — and takes
// p_actor_initials, resolving them itself among the active Users assigned to
// auth.store_id() exactly as actor_resolve does; the registration is logged
// against that person. Store session only.
import { z } from "zod";
import { contract, initials } from "../wrapper";

export const TerminalRegisterInput = z.strictObject({
  p_actor_initials: initials,
  /** The terminal's own name — "Till 1" — for its drawer and receipts (E-01, What a terminal is). */
  p_name: z.string().trim().min(1),
});
export type TerminalRegisterInput = z.infer<typeof TerminalRegisterInput>;

export const TerminalRegisterOutput = z.object({
  terminal_id: z.string().uuid(),
  /** Who stood at it (A-113). */
  registered_by_user_id: z.string().uuid(),
});
export type TerminalRegisterOutput = z.infer<typeof TerminalRegisterOutput>;

export const terminal_register = contract("terminal_register", TerminalRegisterInput, TerminalRegisterOutput);
