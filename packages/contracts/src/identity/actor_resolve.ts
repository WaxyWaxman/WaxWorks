// actor_resolve — §6 Identity; §5.3, A-87, A-113; E-01 d17, d19, d25; M-04 d15
// A header exception (A-113): the one place a string becomes a person, so it
// takes no actor arguments. Resolves an exact, normalised match among the
// active Users assigned to authz.store_id(); anything else is not_found, naming
// nobody. Store session only; the terminal is verified (A-94).
// Not modelled at M1: §6's exception for a Sale already Open and locked to a
// deactivated User — there are no Sales until M4.
import { z } from "zod";
import { contract, initials, role } from "../wrapper";

export const ActorResolveInput = z.strictObject({
  p_initials: initials,
  p_terminal_id: z.string().uuid(),
});
export type ActorResolveInput = z.infer<typeof ActorResolveInput>;

export const ActorResolveOutput = z.object({
  user_id: z.string().uuid(),
  /** The prompt confirms with the name, never by echoing the letters (E-01 d19). */
  display_name: z.string(),
  role,
});
export type ActorResolveOutput = z.infer<typeof ActorResolveOutput>;

export const actor_resolve = contract("actor_resolve", ActorResolveInput, ActorResolveOutput);
