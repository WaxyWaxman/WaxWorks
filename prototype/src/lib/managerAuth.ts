import type { User } from "../data/types";

/**
 * A display name that has been **proved** to belong to an active Manager.
 *
 * ARCHITECTURE §6 IS WHY THIS IS A TYPE AND NOT A STRING. Manager-only
 * functions take `p_manager_user_id` and `p_manager_initials`, and *"the id is
 * what the function trusts and the initials are what it displays"* — because
 * [M-04](docs/flows/M-04-manage-users.md) d16 releases a deactivated User's
 * initials to a new hire, so a string alone resolves to a different person over
 * time. §6 also has an M function resolve that id to an active Manager itself,
 * in the same transaction, rather than trusting that `manager_authorize` was
 * called first.
 *
 * The prototype has no database, so the store is where a definer function would
 * be. Every gated write took the authorizer as a plain `string` and re-checked
 * nothing: an Employee's name was accepted, and the only thing testing
 * Manager-ness was `ManagerAuthorize` — the screen. A-4 and A-48 refuse exactly
 * that shape, and A-81 says it of the write-off gate by name.
 *
 * BRANDING THE STRING IS WHAT MAKES IT A BOUND RATHER THAN A CONVENTION.
 * `authorizeManager` below is the only way to obtain one, so a gated function
 * cannot be called with a name that did not pass the check — the compiler
 * refuses it, at every call site, including ones nobody thought to test. It
 * still behaves as a string everywhere it is logged, which is how A-28a gets
 * both names into the record.
 */
export interface ManagerAuth {
  /** The fact. §6: "the id is what the function trusts". */
  readonly userId: string;
  /** The label. §6: "the initials are what it displays". */
  readonly name: string;
  readonly __managerAuthorized: unique symbol;
}

/** Why an authorization was refused, or `undefined` when it holds. */
export type ManagerAuthRefusal = string;

/**
 * Resolve a user id to an **active Manager**, the way §6 has
 * `manager_authorize` resolve one "at the moment of the call, so a demotion
 * bites server-side at once".
 *
 * Takes the id rather than the name deliberately: the id is the fact, the name
 * is the label. Returns the branded display name on success so the caller has
 * something to record, and a refusal naming the person on failure — an Employee
 * who resolves is refused **by name** rather than by a blank no.
 */
export function authorizeManager(
  users: User[],
  managerUserId: string | undefined,
): { ok: true; auth: ManagerAuth } | { ok: false; refusal: ManagerAuthRefusal } {
  if (!managerUserId) {
    return { ok: false, refusal: "This action is manager-only and no Manager authorized it (A-28a)." };
  }
  const who = users.find((u) => u.id === managerUserId);
  if (!who) {
    // The id resolved to nobody. In the product this is a caller inventing one,
    // which is the case A-4's "invariants hold regardless of caller" exists for.
    return { ok: false, refusal: "That authorization does not resolve to a User (A-28a)." };
  }
  // M-04 d5 deactivates rather than deletes, so a departed Manager's row
  // outlives them and a stale id stays resolvable. Being a row is not being
  // allowed.
  if (!who.active) {
    return { ok: false, refusal: `${who.name} is no longer an active User — this needs a Manager (A-28a).` };
  }
  if (who.role !== "Manager") {
    return { ok: false, refusal: `${who.name} is an ${who.role} — this needs a Manager (A-28a).` };
  }
  return {
    ok: true,
    auth: { userId: who.id, name: `${who.name} (Manager)` } as unknown as ManagerAuth,
  };
}

/**
 * RE-RESOLVE AT THE MOMENT OF THE WRITE, which is what §6 actually asks for:
 * an M function "resolves `p_manager_user_id` to an active Manager itself, in
 * the same transaction", and `manager_authorize` resolves "at the moment of the
 * call, so a demotion bites server-side at once".
 *
 * The brand alone proves the id passed the check when it was MINTED. That is
 * not the same claim: a Manager demoted or deactivated between the prompt and
 * the write would still get through. Every gated store function calls this
 * first and refuses on anything but an active Manager.
 */
export function requireManager(
  users: User[],
  auth: ManagerAuth | undefined,
): { ok: true; name: string } | { ok: false; refusal: ManagerAuthRefusal } {
  const res = authorizeManager(users, auth?.userId);
  // Re-derive the display name from the row rather than trusting the one the
  // caller carried — a rename between prompt and write should not record a
  // stale label against the act.
  return res.ok ? { ok: true, name: res.auth.name } : res;
}

/**
 * For the one place a Manager is already known and only needs carrying — the
 * seed, and tests. Never reachable from a screen, and named so a reader has to
 * mean it.
 */
export const unsafeManagerAuth = (userId: string, displayName: string): ManagerAuth =>
  ({ userId, name: displayName }) as unknown as ManagerAuth;
