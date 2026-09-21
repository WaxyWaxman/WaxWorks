import { z } from "zod";
import { ContractError, NotImplementedError, type WaxClient } from "./client";
import { FUNCTIONS } from "./functions";

// The header every definer function shares (A-103, §6, A-94). Validation here is
// ergonomics — the function asserts every one of these again (A-4, A-48).
export const header = z.object({
  p_actor_user_id: z.string().uuid(),
  p_actor_initials: z.string().min(1),
  /** Store session only; null on a personal or sysadmin session (A-94). */
  p_terminal_id: z.string().uuid().nullable(),
});

// A-94: p_request_id "correlates, never authorises", and the wrapper mints it —
// so it is NOT in the header above. A caller cannot supply one, cannot reuse one
// across two calls, and cannot make two requests look like one in the audit
// record. The database signature keeps the argument; only the input schema loses
// it.
//
// WHICH functions get one is read from the committed §6 list, not from whether
// the parsed input happens to carry an actor argument. An earlier revision keyed
// it on `"p_actor_user_id" in args`, which coincides with A-94's "every write"
// only while every non-pure function takes that argument — and the M1 contract
// pull request may answer otherwise for the S functions (this order's findings 6
// and 24). Keyed on a value, an S function losing its actor argument would stop
// being correlated silently, and A-90 requires each of them to append
// `organizations.log`, which A-94 requires to carry a request id.
//
// A pure helper takes its values as arguments and reads no table (§6), so it has
// nothing to correlate. A name the list does not know mints one: a spurious
// argument fails loudly at PostgREST, where a missing correlation id would not.
export function isCorrelated(fn: string): boolean {
  const entry = FUNCTIONS.find((f) => f.name === fn);
  return entry ? entry.kind !== "pure" : true;
}

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
    const args = { ...(parsed.data as Record<string, unknown>) };
    if (isCorrelated(fn)) args.p_request_id = crypto.randomUUID();
    const result = await client.rpc(fn, args);
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
