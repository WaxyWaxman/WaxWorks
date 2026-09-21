import { z } from "zod";
import { ContractError, NotImplementedError, type WaxClient } from "./client";

// The header every definer function shares (A-103, §6, A-94). Validation here is
// ergonomics — the function asserts every one of these again (A-4, A-48).
export const header = z.object({
  p_actor_user_id: z.string().uuid(),
  p_actor_initials: z.string().min(1),
  /** Minted by the wrapper; correlates, never authorises (A-94). */
  p_request_id: z.string().uuid(),
  /** Store session only; null on a personal or sysadmin session (A-94). */
  p_terminal_id: z.string().uuid().nullable(),
});

/** Manager-only (M) and Owner-only (O) functions take the PIN on a store session (§6, A-89). */
export const managerHeader = header.extend({
  p_manager_pin: z.string().nullable(),
});

/** The one wrapper shape (A-98): parse in, call, parse out, typed error. */
export type Wrapper<I extends z.ZodTypeAny, O extends z.ZodTypeAny> = (
  client: WaxClient,
  input: z.input<I>,
) => Promise<z.output<O>>;

/** A full contract: the milestone's contract pull request replaces a stub with one of these. */
export function contract<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(fn: string, input: I, output: O): Wrapper<I, O> {
  return async (client, raw) => {
    const parsed = input.safeParse(raw);
    if (!parsed.success) throw new ContractError(fn, "invalid_input", "input does not match the contract", parsed.error.issues);
    const result = await client.rpc(fn, parsed.data as Record<string, unknown>);
    const out = output.safeParse(result);
    if (!out.success) throw new ContractError(fn, "invalid_output", "the function returned a shape the contract does not describe", out.error.issues);
    return out.data;
  };
}

/** The M0 skeleton (A-99): the signature exists; calling it says so. */
export function stub<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(fn: string, _input: I, _output: O): Wrapper<I, O> {
  return async (_client, _raw) => {
    throw new NotImplementedError(fn);
  };
}
