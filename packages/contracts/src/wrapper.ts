import { z } from "zod";
import { ContractError, NotImplementedError, RpcFailure, RpcRefusal, type WaxClient } from "./client";
import { FUNCTIONS } from "./functions";

/** Four digits, exactly (A-89, E-01 d26). Never echoed: a refusal names no PIN (A-93). */
export const pin = z.string().regex(/^[0-9]{4}$/, { error: "a PIN is four digits" });

/** The three roles of an Organization, each a strict superset of the one before (M-04 d25). */
export const role = z.enum(["employee", "manager", "owner"]);

/** Initials as typed; the function trims and upper-cases them on write (M-04 d20) and asserts uniqueness. */
export const initials = z.string().trim().min(1);

// The header every definer function shares (A-103, §6, A-94). Validation here is
// ergonomics — the function asserts every one of these again (A-4, A-48).
export const header = z.object({
  p_actor_user_id: z.string().uuid(),
  /**
   * The initials the actor was resolved from on a store session. Null on a
   * personal session, where the actor is the session holder (§6) and may hold
   * no initials at all while they hold no Store (M-04 d34, E-01 d36).
   */
  p_actor_initials: z.string().min(1).nullable(),
  /** Store session only; null on a personal session (A-94). */
  p_terminal_id: z.string().uuid().nullable(),
});

// A-94: p_request_id "correlates, never authorises", and the wrapper mints it —
// so it is NOT in the header above. A caller cannot supply one, cannot reuse one
// across two calls, and cannot make two requests look like one in the audit
// record. The database signature keeps the argument; only the input schema loses
// it.
//
// WHICH functions get one is read from the committed §6 list, not from whether
// the parsed input happens to carry an actor argument: the five header
// exceptions (A-113) take no actor header and every one of them still takes
// p_request_id. Keyed on a value, an S function losing its actor argument would
// stop being correlated silently, and A-90 requires each of them to append
// `organizations.log`, which A-94 requires to carry a request id.
//
// A pure helper takes its values as arguments and reads no table (§6), so it has
// nothing to correlate. A name the list does not know mints one: a spurious
// argument fails loudly at PostgREST, where a missing correlation id would not.
export function isCorrelated(fn: string): boolean {
  const entry = FUNCTIONS.find((f) => f.name === fn);
  return entry ? entry.kind !== "pure" : true;
}

/** Manager-only (M) and Owner-only (O) functions take the PIN on a store session; null on a personal one (§6, A-89). */
export const managerHeader = header.extend({
  p_manager_pin: pin.nullable(),
});

/**
 * A System Administrator's (S) functions: the actor is the System
 * Administrator's Auth user id, and no initials, terminal or PIN (A-113, A-110).
 */
export const sysadminHeader = z.object({
  p_actor_user_id: z.string().uuid(),
});

/** The one wrapper shape (A-98): parse in, call, parse out, typed error. */
export type Wrapper<I extends z.ZodTypeAny, O extends z.ZodTypeAny> = ((
  client: WaxClient,
  input: z.input<I>,
) => Promise<z.output<O>>) & {
  /** True for an M0 skeleton entry whose milestone has not opened (A-99). */
  readonly isStub: boolean;
};

function shaped<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  call: (client: WaxClient, input: z.input<I>) => Promise<z.output<O>>,
  isStub: boolean,
): Wrapper<I, O> {
  return Object.assign(call, { isStub });
}

/** A full contract: the milestone's contract pull request replaces a stub with one of these. */
export function contract<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(fn: string, input: I, output: O): Wrapper<I, O> {
  return shaped<I, O>(async (client, raw) => {
    // A-108: minted first, for every call, so every error below carries it.
    const request_id = crypto.randomUUID();
    const parsed = input.safeParse(raw);
    if (!parsed.success) {
      throw new ContractError(fn, { code: "invalid_input", request_id, message: "input does not match the contract", details: parsed.error.issues });
    }
    const args = { ...(parsed.data as Record<string, unknown>) };
    if (isCorrelated(fn)) args.p_request_id = request_id;
    let result: unknown;
    try {
      result = await client.rpc(fn, args);
    } catch (e) {
      if (e instanceof RpcRefusal) {
        throw new ContractError(fn, { code: e.code, key: e.key, request_id, detail: e.detail, details: e.details });
      }
      // The key is always rpc_failed; the code keeps the failure's class where
      // the client has one (PGRST301 is an expired session, M1 order finding 15).
      const code = e instanceof RpcFailure && e.code ? e.code : "rpc_failed";
      throw new ContractError(fn, { code, key: "rpc_failed", request_id, message: "the call did not complete", details: e });
    }
    const out = output.safeParse(result);
    if (!out.success) {
      throw new ContractError(fn, { code: "invalid_output", request_id, message: "the function returned a shape the contract does not describe", details: out.error.issues });
    }
    return out.data;
  }, false);
}

/** The M0 skeleton (A-99): the signature exists; calling it says so — with a request id (A-108). */
export function stub<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(fn: string, _input: I, _output: O): Wrapper<I, O> {
  return shaped<I, O>(async (_client, _raw) => {
    throw new NotImplementedError(fn, crypto.randomUUID());
  }, true);
}
