import { isManagerial, type User } from "../data/types";

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
 * Resolve a user id to an **active Manager or Owner**, the way §6 has the
 * authorization resolve "at the moment of the call, so a demotion bites
 * server-side at once". An Owner is a strict superset of a Manager (M-04 d25),
 * so every manager-only line is open to one (A-89).
 *
 * Takes the id rather than the name deliberately: the id is the fact, the name
 * is the label. Returns the branded display name on success so the caller has
 * something to record, and a refusal naming the person on failure — an Employee
 * who resolves is refused **by name** rather than by a blank no.
 *
 * THIS IS NOT HOW A STORE SESSION AUTHORIZES. A-89: on a store session an M
 * function takes the PIN and resolves it itself — `authorizeByPin` below —
 * because a caller able to invoke the function is equally able to invent an
 * id. This id-based path is for the two places the id is already a fact: a
 * personal session (`auth.user_id()` — `authorizeFromPersonalSession`), and
 * the re-resolution every gated write performs (`requireManager`).
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
  if (!isManagerial(who.role)) {
    return { ok: false, refusal: `${who.name} is an ${who.role} — this needs a Manager or Owner (A-28a).` };
  }
  return {
    ok: true,
    auth: { userId: who.id, name: `${who.name} (${who.role})` } as unknown as ManagerAuth,
  };
}

/**
 * E-01 d26 / A-89 — THE STORE-SESSION DOOR. A four-digit PIN typed on its own
 * resolves to the one active Manager or Owner **assigned to the Store in
 * session** holding it, or to nobody.
 *
 * A MISS NAMES NOBODY. The refusal says only that no Manager or Owner at this
 * Store has that PIN — never *whose* it nearly was and never whether the digits
 * belong to somebody assigned elsewhere — because a pad that says *that is
 * R. Delacroix's, and it is wrong* is an oracle (E-01 d26). Initials are not
 * secret and are refused by name; a PIN is a credential and is not.
 *
 * In the product this is `manager_authorize_pin`, and every M function on a
 * store session calls it with `p_manager_pin` rather than trusting an id.
 */
export function authorizeByPin(
  users: User[],
  storeId: string,
  pin: string,
): { ok: true; auth: ManagerAuth; userId: string } | { ok: false; refusal: ManagerAuthRefusal } {
  const typed = pin.trim();
  const holder = users.find(
    (u) => u.active && isManagerial(u.role) && u.assignments.includes(storeId) && u.pin !== undefined && u.pin === typed,
  );
  if (!holder) {
    return { ok: false, refusal: "No Manager or Owner at this Store has that PIN (E-01 d26)." };
  }
  const res = authorizeManager(users, holder.id);
  return res.ok ? { ok: true, auth: res.auth, userId: holder.id } : res;
}

/**
 * E-01 d27 / A-89 — THE PERSONAL-SESSION DOOR. Signed in as themselves with a
 * password and a second factor, a Manager or Owner needs no PIN: the session
 * is the authorization, and the one name recorded is both names (M-04 d31).
 * A thin, named wrapper so the component and the test can say which door was
 * used; an Employee's personal session does not exist (E-01 d27) and is refused
 * here in case one is ever minted.
 */
export function authorizeFromPersonalSession(
  users: User[],
  userId: string,
): { ok: true; auth: ManagerAuth } | { ok: false; refusal: ManagerAuthRefusal } {
  return authorizeManager(users, userId);
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
 * O-01 d1 / A-89 — the second question an **O** function asks after
 * `requireManager`: *is this an Owner?* Refused **by name**, because by now the
 * person is known and no secret is at stake. A Manager who crossed the line by
 * PIN sees who was refused and why; the write path refuses regardless of what
 * any screen offered (M-04 d30).
 */
export function requireOwner(
  users: User[],
  auth: ManagerAuth | undefined,
): { ok: true; name: string } | { ok: false; refusal: ManagerAuthRefusal } {
  const res = requireManager(users, auth);
  if (!res.ok) return res;
  const who = users.find((u) => u.id === auth!.userId)!;
  if (who.role !== "Owner") {
    return { ok: false, refusal: `${who.name} is a ${who.role} — this is Owner-only (M-04 d30, O-01 d1).` };
  }
  return res;
}

/**
 * For the one place a Manager is already known and only needs carrying — the
 * seed, and tests. Never reachable from a screen, and named so a reader has to
 * mean it.
 */
export const unsafeManagerAuth = (userId: string, displayName: string): ManagerAuth =>
  ({ userId, name: displayName }) as unknown as ManagerAuth;
