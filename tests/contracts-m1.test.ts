// The M1 contracts order (docs/build/orders/M1-contracts.md), rows 3 and 8–30:
// the Identity set's schemas and the in-memory fake's behaviour. Every refusal
// is asserted by its message key and the SQLSTATE conventions §5's table gives
// that key (row 30), never by human text.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as c from "../packages/contracts/src/index";
import { ContractError, REFUSALS, RpcRefusal, type RefusalKey, type WaxClient } from "../packages/contracts/src/client";
import { createFakeClient, type FakeClient, type FakeSession } from "../packages/contracts/src/fake";

const SYSADMIN = "5a5a5a5a-0000-4000-8000-000000000001";
const T0 = new Date("2026-10-13T10:00:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const sysadminSession: FakeSession = { principal: "sysadmin", org_id: null, store_id: null, user_id: null, terminal_id: null, auth_uid: SYSADMIN };
const person = (org_id: string, user_id: string, store_id: string | null = null): FakeSession =>
  ({ principal: "person", org_id, store_id, user_id, terminal_id: null });
const storeSession = (org_id: string, store_id: string): FakeSession =>
  ({ principal: "store", org_id, store_id, user_id: null, terminal_id: null });

/** The error a call that must fail threw; a success fails the test. */
const failed = (call: Promise<unknown>): Promise<ContractError> =>
  call.then(() => { throw new Error("expected the call to fail, and it succeeded"); }, (e: unknown) => e as ContractError);

/** The refusal, by key, carrying the SQLSTATE the table assigns that key (row 30). */
async function refused(call: Promise<unknown>, key: RefusalKey): Promise<ContractError> {
  const err = await call.then(
    () => { throw new Error(`expected a ${key} refusal, and the call succeeded`); },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ContractError);
  const ce = err as ContractError;
  expect({ key: ce.key, code: ce.code }).toEqual({ key, code: REFUSALS[key] });
  expect(ce.request_id).toMatch(UUID);
  return ce;
}

/**
 * One Organization built through the write surface, as the seed is (A-101):
 * a System Administrator onboards it, its Owner creates two Stores on a
 * personal session, takes initials and a PIN and assigns themselves to A, adds
 * a Manager at A and an Employee at A and B, and two terminals register at A.
 */
async function world() {
  let now = T0;
  const clock = { advance: (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); } };
  const root = createFakeClient({ session: sysadminSession, sysadmins: [{ auth_user_id: SYSADMIN, name: "sr-talbot" }], now: () => now });
  const org = await c.organization_create(root, {
    p_actor_user_id: SYSADMIN, p_name: "Sonic Boom Records", p_owner_name: "M. Chen", p_owner_email: "m.chen@example.test",
  });
  const ownerId = org.owner_user_id;
  const owner = root.withSession(person(org.org_id, ownerId));
  const asOwner = { p_actor_user_id: ownerId, p_actor_initials: null, p_terminal_id: null, p_manager_pin: null };
  const A = await c.store_create(owner, { ...asOwner, p_trading_name: "Home", p_store_account_email: "home@example.test" });
  const B = await c.store_create(owner, { ...asOwner, p_trading_name: "Plateau", p_store_account_email: "plateau@example.test" });
  await c.user_correct(owner, { ...asOwner, p_user_id: ownerId, p_initials: "MC" });
  await c.user_set_pin(owner, { ...asOwner, p_user_id: ownerId, p_pin: "1111" });
  await c.user_assign(owner, { ...asOwner, p_user_id: ownerId, p_store_id: A.store_id });
  const jm = await c.user_add(owner, {
    ...asOwner, p_display_name: "J. Mbeki", p_initials: "JM", p_role: "manager", p_email: "jm@example.test", p_store_ids: [A.store_id], p_pin: "2222",
  });
  const yn = await c.user_add(owner, {
    ...asOwner, p_display_name: "Y. Nakamura", p_initials: "YN", p_role: "employee", p_email: null, p_store_ids: [A.store_id, B.store_id], p_pin: null,
  });
  const storeA = root.withSession(storeSession(org.org_id, A.store_id));
  const storeB = root.withSession(storeSession(org.org_id, B.store_id));
  const t1 = await c.terminal_register(storeA, { p_actor_initials: "YN", p_name: "Till 1" });
  const t2 = await c.terminal_register(storeA, { p_actor_initials: "YN", p_name: "Till 2" });
  const tB = await c.terminal_register(storeB, { p_actor_initials: "YN", p_name: "Till 1" });
  /** Y. Nakamura's staff session on terminal t, with a Manager's PIN typed at the line. */
  const atA = (t: string, pin: string | null) => ({ p_actor_user_id: yn.user_id, p_actor_initials: "YN", p_terminal_id: t, p_manager_pin: pin });
  return { root, clock, org, ownerId, owner, asOwner, A, B, jm, yn, storeA, storeB, t1: t1.terminal_id, t2: t2.terminal_id, tB: tB.terminal_id, atA };
}

const employee = (p_display_name: string, p_initials: string, stores: string[], p_email: string | null = null) =>
  ({ p_display_name, p_initials, p_role: "employee" as const, p_email, p_store_ids: stores, p_pin: null });

describe("A-108 — the wrapper mints the correlation id before it validates, for every call, and sends it only where A-94 requires an argument", () => {
  it("an invalid_input error carries a request_id", async () => {
    const err = await failed(c.actor_resolve(createFakeClient(), { p_initials: "", p_terminal_id: "not-a-uuid" } as never));
    expect(err).toMatchObject({ code: "invalid_input" });
    expect((err as ContractError).request_id).toMatch(UUID);
  });

  it("a stub's not_implemented carries one", async () => {
    const err = await failed(c.sale_open(createFakeClient(), {} as never));
    expect(err).toMatchObject({ code: "not_implemented" });
    expect((err as ContractError).request_id).toMatch(UUID);
  });

  it("a refusal carries the very id that was sent as p_request_id", async () => {
    const sent: Record<string, unknown>[] = [];
    const client: WaxClient = {
      async rpc(fn, args) { sent.push(args); throw new RpcRefusal(fn, "P0002", "not_found"); },
    };
    const err = await failed(c.actor_resolve(client, { p_initials: "YN", p_terminal_id: "00000000-0000-4000-8000-000000000009" }));
    expect(sent[0]!.p_request_id).toMatch(UUID);
    expect(err.request_id).toBe(sent[0]!.p_request_id);
    expect(err).toMatchObject({ key: "not_found", code: "P0002" });
  });

  it("a failure that is not a refusal still surfaces as a ContractError with the id", async () => {
    const client: WaxClient = { async rpc() { throw new TypeError("fetch failed"); } };
    const err = await failed(c.actor_resolve(client, { p_initials: "YN", p_terminal_id: "00000000-0000-4000-8000-000000000009" }));
    expect(err).toBeInstanceOf(ContractError);
    expect(err.request_id).toMatch(UUID);
  });
});

describe("A-94 — every write carries a request id: the fake stamps the one the wrapper sent on the log row it writes", () => {
  it("users.log carries the request id of the call that wrote it, and the principal", async () => {
    const w = await world();
    const log = w.root.inspect().log.filter((l) => l.subject_id === w.yn.user_id && l.action === "user_added");
    expect(log).toHaveLength(1);
    expect(log[0]!.request_id).toMatch(UUID);
    expect(log[0]!.principal).toBe("person");
  });
});

describe("E-01 d26 — on a store session a manager-only action is authorized by a four-digit PIN, unique among the Store's assigned Managers and Owners; a wrong PIN names nobody", () => {
  it("a wrong PIN on user_add refuses without a name", async () => {
    const w = await world();
    const err = await refused(c.user_add(w.storeA, { ...w.atA(w.t1, "4321"), ...employee("K. Park", "KP", [w.A.store_id]) }), "pin_refused");
    const said = JSON.stringify({ ...err, message: err.message });
    for (const name of ["Mbeki", "Chen", "Nakamura"]) expect(said).not.toContain(name);
    expect(err.detail).toBeUndefined();
  });

  it("the PIN of a Manager assigned to another Store is refused the same way", async () => {
    const w = await world();
    await c.user_add(w.owner, { ...w.asOwner, p_display_name: "K. Moreau", p_initials: "KM", p_role: "manager", p_email: "km@example.test", p_store_ids: [w.B.store_id], p_pin: "3333" });
    await refused(c.user_add(w.storeA, { ...w.atA(w.t1, "3333"), ...employee("K. Park", "KP", [w.A.store_id]) }), "pin_refused");
  });

  it("the Store's Manager's PIN authorizes, and the PIN must be four digits", async () => {
    const w = await world();
    await expect(c.user_add(w.storeA, { ...w.atA(w.t1, "2222"), ...employee("K. Park", "KP", [w.A.store_id]) })).resolves.toMatchObject({ invite: false });
    await expect(c.user_add(w.storeA, { ...w.atA(w.t1, "22222"), ...employee("L. Park", "LP", [w.A.store_id]) })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("both names are recorded: the acting Employee and the Manager whose PIN it was", async () => {
    const w = await world();
    const kp = await c.user_add(w.storeA, { ...w.atA(w.t1, "2222"), ...employee("K. Park", "KP", [w.A.store_id]) });
    const row = w.root.inspect().log.find((l) => l.subject_id === kp.user_id && l.action === "user_added")!;
    expect({ actor: row.actor_user_id, authorized_by: row.manager_user_id, terminal: row.terminal_id }).toEqual({ actor: w.yn.user_id, authorized_by: w.jm.user_id, terminal: w.t1 });
  });
});

describe("E-01 d31 — five wrong PINs within fifteen minutes, across the Store's terminals, close its manager-only line for fifteen minutes and raise a review flag", () => {
  const wrong = ["9001", "9002", "9003", "9004", "9005"];

  it("five refusals on two terminals close the line; a correct PIN is then refused with the reopening time; a personal session is unaffected", async () => {
    const w = await world();
    for (const [i, pin] of wrong.entries()) {
      await refused(c.user_add(w.storeA, { ...w.atA(i < 4 ? w.t1 : w.t2, pin), ...employee("K. Park", "KP", [w.A.store_id]) }), "pin_refused");
    }
    const closed = await refused(c.user_add(w.storeA, { ...w.atA(w.t2, "2222"), ...employee("K. Park", "KP", [w.A.store_id]) }), "pin_line_closed");
    expect(closed.detail).toBe(new Date(T0.getTime() + 15 * 60_000).toISOString());
    expect(JSON.stringify({ ...closed, message: closed.message })).not.toContain("Mbeki");

    // Counted per Store: Plateau's line is open.
    await c.user_add(w.owner, { ...w.asOwner, p_display_name: "K. Moreau", p_initials: "KM", p_role: "manager", p_email: "km@example.test", p_store_ids: [w.B.store_id], p_pin: "3333" });
    const atB = { p_actor_user_id: w.yn.user_id, p_actor_initials: "YN", p_terminal_id: w.tB, p_manager_pin: "3333" };
    await expect(c.user_add(w.storeB, { ...atB, ...employee("L. Park", "LP", [w.B.store_id]) })).resolves.toBeTruthy();

    // A personal session carries no PIN and is never locked out by the counter.
    await expect(c.user_add(w.owner, { ...w.asOwner, ...employee("K. Park", "KP", [w.A.store_id]) })).resolves.toBeTruthy();

    const flags = w.root.inspect().flags.filter((f) => f.kind === "pin_line_closed");
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ store_id: w.A.store_id, terminal_id: w.t2, actor_user_id: w.yn.user_id });

    w.clock.advance(15);
    await expect(c.user_add(w.storeA, { ...w.atA(w.t1, "2222"), ...employee("M. Park", "MP", [w.A.store_id]) })).resolves.toBeTruthy();
  });

  it("each refusal is recorded with its Store, terminal, time and open staff session, never the digits", async () => {
    const w = await world();
    for (const pin of wrong.slice(0, 2)) {
      await refused(c.user_add(w.storeA, { ...w.atA(w.t1, pin), ...employee("K. Park", "KP", [w.A.store_id]) }), "pin_refused");
    }
    const records = w.root.inspect().pinRefusals;
    expect(records).toEqual([
      { store_id: w.A.store_id, terminal_id: w.t1, at: T0.toISOString(), staff_user_id: w.yn.user_id },
      { store_id: w.A.store_id, terminal_id: w.t1, at: T0.toISOString(), staff_user_id: w.yn.user_id },
    ]);
    // Ids are random hex and can contain any four digits, so they are struck
    // before looking for a PIN: what is left is every value the fake stored.
    const all = JSON.stringify(w.root.inspect()).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>");
    for (const pin of wrong) expect(all).not.toContain(pin);
  });
});

describe("E-01 d32 — the PIN pad checks a PIN by itself under decision 31's throttle", () => {
  it("manager_authorize_pin names the one holder at this Store, or refuses naming nobody", async () => {
    const w = await world();
    await expect(c.manager_authorize_pin(w.storeA, { p_pin: "2222", p_terminal_id: w.t1 })).resolves.toEqual({ user_id: w.jm.user_id, display_name: "J. Mbeki", role: "manager" });
    await refused(c.manager_authorize_pin(w.storeA, { p_pin: "4321", p_terminal_id: w.t1 }), "pin_refused");
  });

  it("three refusals at manager_authorize_pin and two at user_set_pin close the line", async () => {
    const w = await world();
    for (const pin of ["9001", "9002", "9003"]) await refused(c.manager_authorize_pin(w.storeA, { p_pin: pin, p_terminal_id: w.t1 }), "pin_refused");
    for (const pin of ["9004", "9005"]) await refused(c.user_set_pin(w.storeA, { ...w.atA(w.t2, pin), p_user_id: w.jm.user_id, p_pin: "2468" }), "pin_refused");
    await refused(c.manager_authorize_pin(w.storeA, { p_pin: "2222", p_terminal_id: w.t1 }), "pin_line_closed");
  });

  it("the pad checks on a store session only", async () => {
    const w = await world();
    await refused(c.manager_authorize_pin(w.owner, { p_pin: "1111", p_terminal_id: w.t1 }), "role_refused");
  });
});

describe("E-01 d25 — initials resolve among the Users assigned to the Store in session", () => {
  it("initials held only at another Store do not resolve, at actor_resolve or at terminal_register", async () => {
    const w = await world();
    await c.user_add(w.owner, { ...w.asOwner, ...employee("E. Ouellet", "EO", [w.B.store_id]) });
    await refused(c.actor_resolve(w.storeA, { p_initials: "EO", p_terminal_id: w.t1 }), "not_found");
    await refused(c.terminal_register(w.storeA, { p_actor_initials: "EO", p_name: "Till 3" }), "not_found");
    await expect(c.actor_resolve(w.storeB, { p_initials: "EO", p_terminal_id: w.tB })).resolves.toMatchObject({ display_name: "E. Ouellet" });
  });

  it("a User assigned to both resolves at either, by name, and initials are normalised (M-04 d20)", async () => {
    const w = await world();
    await expect(c.actor_resolve(w.storeA, { p_initials: " yn", p_terminal_id: w.t1 })).resolves.toEqual({ user_id: w.yn.user_id, display_name: "Y. Nakamura", role: "employee" });
    await expect(c.actor_resolve(w.storeB, { p_initials: "YN", p_terminal_id: w.tB })).resolves.toMatchObject({ user_id: w.yn.user_id });
  });

  it("a terminal of another Store is refused (A-94)", async () => {
    const w = await world();
    await refused(c.actor_resolve(w.storeA, { p_initials: "YN", p_terminal_id: w.tB }), "terminal_mismatch");
  });
});

describe("E-01 d33 — a Manager or Owner signs in with a passkey and no password: no Identity input carries a password", () => {
  const identity = c.FUNCTIONS.filter((f) => f.domain === "identity");
  it.each(identity.map((f) => [f.name] as const))("%s has no password-named field", (name) => {
    const schema = (c as unknown as Record<string, { shape: Record<string, unknown> }>)[`${pascal(name)}Input`]!;
    expect(Object.keys(schema.shape).filter((k) => /pass(word)?|secret/i.test(k))).toEqual([]);
  });
});

describe("E-01 d36 — an Owner whose Organization has no Store lands with no Store picked; the Store they create becomes their pick", () => {
  it("session_select_store reports none, then the new one after store_create", async () => {
    const root = createFakeClient({ session: sysadminSession, sysadmins: [{ auth_user_id: SYSADMIN, name: "sr-talbot" }] });
    const org = await c.organization_create(root, { p_actor_user_id: SYSADMIN, p_name: "Spin City", p_owner_name: "A. Beaulieu", p_owner_email: "ab@example.test" });
    const owner = root.withSession(person(org.org_id, org.owner_user_id));
    const asOwner = { p_actor_user_id: org.owner_user_id, p_actor_initials: null, p_terminal_id: null };
    await expect(c.session_select_store(owner, { ...asOwner, p_store_id: null })).resolves.toEqual({ selected_store_id: null, stores: [] });
    const s = await c.store_create(owner, { ...asOwner, p_manager_pin: null, p_trading_name: "Spin City Main", p_store_account_email: "main@example.test" });
    await expect(c.session_select_store(owner, { ...asOwner, p_store_id: null })).resolves.toEqual({
      selected_store_id: s.store_id, stores: [{ store_id: s.store_id, trading_name: "Spin City Main" }],
    });
  });

  it("E-01 d27 — a Manager may pick only a Store they are assigned to; an Owner any", async () => {
    const w = await world();
    const jm = w.root.withSession(person(w.org.org_id, w.jm.user_id));
    const asJm = { p_actor_user_id: w.jm.user_id, p_actor_initials: null, p_terminal_id: null };
    await refused(c.session_select_store(jm, { ...asJm, p_store_id: w.B.store_id }), "role_refused");
    await expect(c.session_select_store(jm, { ...asJm, p_store_id: w.A.store_id })).resolves.toMatchObject({ selected_store_id: w.A.store_id });
    await expect(c.session_select_store(w.owner, { p_actor_user_id: w.ownerId, p_actor_initials: null, p_terminal_id: null, p_store_id: w.B.store_id })).resolves.toMatchObject({ selected_store_id: w.B.store_id });
  });
});

describe("M-04 d30 — a Manager administers Employees at their own Stores; anything touching a Manager or Owner is Owner-only, refused in the write path", () => {
  it("a Manager's user_add of a Manager is refused by role; an Owner's is accepted", async () => {
    const w = await world();
    const manager = { p_display_name: "K. Moreau", p_initials: "KM", p_role: "manager" as const, p_email: "km@example.test", p_store_ids: [w.A.store_id], p_pin: "3333" };
    const err = await refused(c.user_add(w.storeA, { ...w.atA(w.t1, "2222"), ...manager }), "role_refused");
    expect(err.detail).toBe("owner");
    await expect(c.user_add(w.owner, { ...w.asOwner, ...manager })).resolves.toMatchObject({ invite: true });
  });

  it("a Manager adds an Employee at their own Store, not at another", async () => {
    const w = await world();
    await expect(c.user_add(w.storeA, { ...w.atA(w.t1, "2222"), ...employee("K. Park", "KP", [w.A.store_id]) })).resolves.toBeTruthy();
    await refused(c.user_add(w.storeA, { ...w.atA(w.t1, "2222"), ...employee("L. Park", "LP", [w.B.store_id]) }), "role_refused");
  });

  it("a Manager's role change of anyone is refused by role", async () => {
    const w = await world();
    await refused(c.user_change_role(w.storeA, { ...w.atA(w.t1, "2222"), p_user_id: w.yn.user_id, p_role: "manager", p_email: "yn@example.test", p_pin: "4444" }), "role_refused");
  });
});

describe("M-04 d37 — a Manager may deactivate, reactivate or correct an Employee who shares any one of their Stores; assignment stays at their own Stores", () => {
  it("Manager at A deactivates an Employee at A and B; cannot assign them elsewhere or deactivate one at B only", async () => {
    const w = await world();
    const C = await c.store_create(w.owner, { ...w.asOwner, p_trading_name: "Annex", p_store_account_email: "annex@example.test" });
    const eo = await c.user_add(w.owner, { ...w.asOwner, ...employee("E. Ouellet", "EO", [w.B.store_id]) });
    const asJm = w.atA(w.t1, "2222");
    await expect(c.user_correct(w.storeA, { ...asJm, p_user_id: w.yn.user_id, p_display_name: "Yuki Nakamura" })).resolves.toBeTruthy();
    await expect(c.user_deactivate(w.storeA, { ...{ ...asJm, p_actor_user_id: w.jm.user_id, p_actor_initials: "JM" }, p_user_id: w.yn.user_id })).resolves.toBeTruthy();
    await expect(c.user_reactivate(w.storeA, { ...{ ...asJm, p_actor_user_id: w.jm.user_id, p_actor_initials: "JM" }, p_user_id: w.yn.user_id, p_initials: null })).resolves.toBeTruthy();
    await refused(c.user_assign(w.storeA, { ...asJm, p_user_id: w.yn.user_id, p_store_id: C.store_id }), "role_refused");
    await refused(c.user_unassign(w.storeA, { ...asJm, p_user_id: w.yn.user_id, p_store_id: w.B.store_id }), "role_refused");
    await refused(c.user_deactivate(w.storeA, { ...asJm, p_user_id: eo.user_id }), "role_refused");
  });
});

describe("M-04 d35 — every Manager and Owner who holds a Store holds a PIN", () => {
  it("M-04-T16's four refusals", async () => {
    const w = await world();
    // Add a Manager with no PIN.
    await refused(c.user_add(w.owner, { ...w.asOwner, p_display_name: "K. Moreau", p_initials: "KM", p_role: "manager", p_email: "km@example.test", p_store_ids: [w.A.store_id], p_pin: null }), "pin_required");
    // Promote an Employee to Manager without one.
    await refused(c.user_change_role(w.owner, { ...w.asOwner, p_user_id: w.yn.user_id, p_role: "manager", p_email: "yn@example.test", p_pin: null }), "pin_required");
    await expect(c.user_change_role(w.owner, { ...w.asOwner, p_user_id: w.yn.user_id, p_role: "manager", p_email: "yn@example.test", p_pin: "4444" })).resolves.toEqual({ user_id: w.yn.user_id, invite: true });
    // Clear a Manager's PIN.
    await refused(c.user_set_pin(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id, p_pin: null }), "pin_required");
    // Assign an Owner with initials and no PIN; give the PIN, then assign.
    const ao = await c.user_add(w.owner, { ...w.asOwner, p_display_name: "A. Okoye", p_initials: "AO", p_role: "owner", p_email: "ao@example.test", p_store_ids: [], p_pin: null });
    await refused(c.user_assign(w.owner, { ...w.asOwner, p_user_id: ao.user_id, p_store_id: w.A.store_id }), "pin_required");
    await c.user_set_pin(w.owner, { ...w.asOwner, p_user_id: ao.user_id, p_pin: "5555" });
    await expect(c.user_assign(w.owner, { ...w.asOwner, p_user_id: ao.user_id, p_store_id: w.A.store_id })).resolves.toBeTruthy();
  });
});

describe("M-04 d36 — an Employee's email is optional; M-04 d33 — a promotion into Manager or Owner sends the invite and needs an email", () => {
  it("Employee with and without email accepted, neither invited; promotion without email refused", async () => {
    const w = await world();
    const none = await c.user_add(w.owner, { ...w.asOwner, ...employee("K. Park", "KP", [w.A.store_id]) });
    const some = await c.user_add(w.owner, { ...w.asOwner, ...employee("L. Park", "LP", [w.A.store_id], "lp@example.test") });
    expect([none.invite, some.invite]).toEqual([false, false]);
    await refused(c.user_change_role(w.owner, { ...w.asOwner, p_user_id: none.user_id, p_role: "manager", p_email: null, p_pin: "4444" }), "email_required");
    await expect(c.user_change_role(w.owner, { ...w.asOwner, p_user_id: some.user_id, p_role: "manager", p_email: null, p_pin: "4444" })).resolves.toEqual({ user_id: some.user_id, invite: true });
  });

  it("a Manager or Owner is added with an email or not at all", async () => {
    const w = await world();
    await refused(c.user_add(w.owner, { ...w.asOwner, p_display_name: "K. Moreau", p_initials: "KM", p_role: "manager", p_email: null, p_store_ids: [w.A.store_id], p_pin: "3333" }), "email_required");
  });

  it("a person promoted back who already holds a passkey is not invited again", async () => {
    const w = await world();
    await c.user_change_role(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id, p_role: "employee", p_email: null, p_pin: null });
    w.root.enrolPasskey(w.jm.user_id);
    await expect(c.user_change_role(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id, p_role: "manager", p_email: null, p_pin: null })).resolves.toEqual({ user_id: w.jm.user_id, invite: false });
  });
});

describe("O-01 d2 and O-01 d3 — a new Store has a trading name and a store account whose password never reaches a definer function (A-91)", () => {
  it("neither store_create nor store_account_reset has a password field, and one supplied is refused as unknown", async () => {
    for (const s of [c.StoreCreateInput, c.StoreAccountResetInput]) {
      expect(Object.keys(s.shape).filter((k) => /pass/i.test(k))).toEqual([]);
    }
    const w = await world();
    await expect(c.store_create(w.owner, { ...w.asOwner, p_trading_name: "Annex", p_store_account_email: "annex@example.test", p_password: "hunter22" } as never))
      .rejects.toMatchObject({ code: "invalid_input" });
  });

  it("store_create mints a seven-digit Store ID and the next position; store_account_reset is Owner-only", async () => {
    const w = await world();
    expect(w.A.store_number).toMatch(/^\d{7}$/);
    expect([w.A.position, w.B.position]).toEqual([1, 2]);
    expect(w.B.store_number).not.toBe(w.A.store_number);
    await expect(c.store_account_reset(w.owner, { ...w.asOwner, p_store_id: w.A.store_id })).resolves.toMatchObject({ store_id: w.A.store_id, store_account_email: "home@example.test" });
    await refused(c.store_account_reset(w.storeA, { ...w.atA(w.t1, "2222"), p_store_id: w.A.store_id }), "role_refused");
    await refused(c.store_create(w.storeA, { ...w.atA(w.t1, "2222"), p_trading_name: "Annex", p_store_account_email: "annex@example.test" }), "role_refused");
  });
});

describe("A-112 — store_create writes the new Store's settings rows itself, at the first shop's values", () => {
  it("a new Store reads back Alberta, CAD, March 31, 80mm and M-06 d45's five-minute lapse", async () => {
    const w = await world();
    const expected = { province: "AB", currency: "CAD", fiscal_year_end: "03-31", receipt_width: "80mm", session_lapse_minutes: 5 };
    expect(w.A.settings).toEqual(expected);
    expect(w.root.inspect().stores.find((s) => s.store_id === w.A.store_id)!.settings).toEqual(expected);
    expect(w.root.inspect().log.filter((l) => l.table === "settings_log" && l.subject_id === w.A.store_id).length).toBeGreaterThan(0);
  });
});

describe("M-04 d26 — the floor is the Organization's: at least one active Owner, always", () => {
  it("M-04-T8 and M-04-T9: the last active Owner can neither be deactivated nor demoted, by anyone including themselves", async () => {
    const w = await world();
    await refused(c.user_deactivate(w.owner, { ...w.asOwner, p_user_id: w.ownerId }), "owner_floor");
    await refused(c.user_change_role(w.owner, { ...w.asOwner, p_user_id: w.ownerId, p_role: "manager", p_email: null, p_pin: null }), "owner_floor");
    // A Store's only Manager is not protected (no per-Store floor).
    await expect(c.user_deactivate(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id })).resolves.toBeTruthy();
    // With a second Owner, stepping down is allowed.
    await c.user_add(w.owner, { ...w.asOwner, p_display_name: "A. Okoye", p_initials: null, p_role: "owner", p_email: "ao@example.test", p_store_ids: [], p_pin: null });
    await expect(c.user_change_role(w.owner, { ...w.asOwner, p_user_id: w.ownerId, p_role: "manager", p_email: null, p_pin: null })).resolves.toBeTruthy();
  });
});

describe("M-04 d32 — a PIN clash at assignment or Set PIN is refused without naming the holder; an initials clash still names them (M-04 d27)", () => {
  it("PIN clash: no name; initials clash: the holder's name", async () => {
    const w = await world();
    const km = await c.user_add(w.owner, { ...w.asOwner, p_display_name: "K. Moreau", p_initials: "KM", p_role: "manager", p_email: "km@example.test", p_store_ids: [w.B.store_id], p_pin: "2222" });
    const assign = await refused(c.user_assign(w.owner, { ...w.asOwner, p_user_id: km.user_id, p_store_id: w.A.store_id }), "pin_clash");
    expect(assign.detail).toBeUndefined();
    const setPin = await refused(c.user_set_pin(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id, p_pin: "1111" }), "pin_clash");
    for (const e of [assign, setPin]) {
      const said = JSON.stringify({ ...e, message: e.message });
      for (const name of ["Mbeki", "Chen", "Moreau"]) expect(said).not.toContain(name);
    }
    // Every refused PIN clash at Set PIN or Assign is logged — actor, Store, time, no digits.
    const logged = w.root.inspect().log.filter((l) => l.action === "pin_clash_refused");
    expect(logged).toHaveLength(2);

    await c.user_add(w.owner, { ...w.asOwner, ...employee("E. Okafor", "EO", [w.A.store_id]) });
    const eo = await c.user_add(w.owner, { ...w.asOwner, ...employee("E. Ouellet", "EO", [w.B.store_id]) });
    const initials = await refused(c.user_assign(w.owner, { ...w.asOwner, p_user_id: eo.user_id, p_store_id: w.A.store_id }), "initials_clash");
    expect(initials.detail).toBe("E. Okafor");
  });
});

describe("M-04 d34 — a User may hold no initials while they hold no Store; assignment requires them (and a PIN, M-04 d35)", () => {
  it("organization_create takes no initials; user_assign refuses an Owner with none, then with no PIN", async () => {
    expect("p_initials" in c.OrganizationCreateInput.shape).toBe(false);
    const w = await world();
    const ao = await c.user_add(w.owner, { ...w.asOwner, p_display_name: "A. Okoye", p_initials: null, p_role: "owner", p_email: "ao@example.test", p_store_ids: [], p_pin: null });
    await refused(c.user_assign(w.owner, { ...w.asOwner, p_user_id: ao.user_id, p_store_id: w.A.store_id }), "initials_required");
    await c.user_correct(w.owner, { ...w.asOwner, p_user_id: ao.user_id, p_initials: "AO" });
    await refused(c.user_assign(w.owner, { ...w.asOwner, p_user_id: ao.user_id, p_store_id: w.A.store_id }), "pin_required");
  });
});

describe("M-04 d38 — a lost passkey is re-enrolled by an Owner (user_reset_request); an Owner re-sends an invite (user_invite_resend, A-114)", () => {
  it("a Manager's call of either is refused by role; user_invite_resend refuses a person already enrolled", async () => {
    const w = await world();
    await refused(c.user_reset_request(w.storeA, { ...w.atA(w.t1, "2222"), p_user_id: w.jm.user_id }), "role_refused");
    await refused(c.user_invite_resend(w.storeA, { ...w.atA(w.t1, "2222"), p_user_id: w.jm.user_id }), "role_refused");
    await expect(c.user_invite_resend(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id })).resolves.toEqual({ user_id: w.jm.user_id, email: "jm@example.test" });
    w.root.enrolPasskey(w.jm.user_id);
    await refused(c.user_invite_resend(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id }), "invalid_state");
    await expect(c.user_reset_request(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id })).resolves.toEqual({ user_id: w.jm.user_id, email: "jm@example.test" });
    // Logged as sent, never the link (M-04 d29, A-93).
    const sent = w.root.inspect().log.filter((l) => l.subject_id === w.jm.user_id && /link_sent|invite_sent/.test(l.action));
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe("S-01 d2 and S-01 d5 — onboarding takes the Organization's name and its first Owner's name and email, and nothing else", () => {
  it("the input schema is exactly that, and initials are refused as unknown keys", async () => {
    expect(Object.keys(c.OrganizationCreateInput.shape).sort()).toEqual(["p_actor_user_id", "p_name", "p_owner_email", "p_owner_name"]);
    const root = createFakeClient({ session: sysadminSession, sysadmins: [{ auth_user_id: SYSADMIN, name: "sr-talbot" }] });
    await expect(c.organization_create(root, { p_actor_user_id: SYSADMIN, p_name: "X", p_owner_name: "Y", p_owner_email: "y@example.test", p_initials: "YY" } as never))
      .rejects.toMatchObject({ code: "invalid_input" });
    const org = await c.organization_create(root, { p_actor_user_id: SYSADMIN, p_name: "X", p_owner_name: "Y", p_owner_email: "y@example.test" });
    expect(root.inspect().users.find((u) => u.user_id === org.owner_user_id)).toMatchObject({ role: "owner", initials: null, store_ids: [], active: true });
  });
});

describe("S-01 d3 — recovery restores an Owner, and A-90 refuses owner_recover while an active Owner exists", () => {
  it("owner_recover is refused while an active Owner exists; owner_reset_request reaches the Owner and is logged on the Organization", async () => {
    const w = await world();
    const sys = w.root.withSession(sysadminSession);
    await refused(c.owner_recover(sys, { p_actor_user_id: SYSADMIN, p_org_id: w.org.org_id, p_user_id: null, p_owner_name: "N. Owner", p_owner_email: "n@example.test" }), "invalid_state");
    await expect(c.owner_reset_request(sys, { p_actor_user_id: SYSADMIN, p_org_id: w.org.org_id, p_user_id: w.ownerId })).resolves.toEqual({ user_id: w.ownerId, email: "m.chen@example.test" });
    const orgLog = w.root.inspect().log.filter((l) => l.table === "organizations.log" && l.subject_id === w.org.org_id);
    expect(orgLog.map((l) => l.actor_user_id)).toContain(SYSADMIN);
  });
});

describe("A-110 — a System Administrator's functions accept only a sysadmin principal, and every other function refuses one (A-90)", () => {
  it("an S call on a store or personal session is refused; user_add on a sysadmin session is refused", async () => {
    const w = await world();
    const sCall = (client: FakeClient) => c.owner_reset_request(client, { p_actor_user_id: SYSADMIN, p_org_id: w.org.org_id, p_user_id: w.ownerId });
    await refused(sCall(w.storeA), "role_refused");
    await refused(sCall(w.owner), "role_refused");
    await refused(c.user_add(w.root.withSession(sysadminSession), { ...w.asOwner, ...employee("K. Park", "KP", [w.A.store_id]) }), "no_tenant");
  });

  it("the actor must be the signed-in System Administrator, with an active row", async () => {
    const w = await world();
    const other = "5a5a5a5a-0000-4000-8000-000000000002";
    await refused(c.owner_reset_request(w.root.withSession(sysadminSession), { p_actor_user_id: other, p_org_id: w.org.org_id, p_user_id: w.ownerId }), "actor_mismatch");
    await refused(c.owner_reset_request(w.root.withSession({ ...sysadminSession, auth_uid: other }), { p_actor_user_id: other, p_org_id: w.org.org_id, p_user_id: w.ownerId }), "role_refused");
  });
});

describe("A-114 — auth_user_link is the service role's write-back and nobody else's", () => {
  it("the service role links an Auth user to a users row; a person or a sysadmin is refused", async () => {
    const w = await world();
    const authId = "a0a0a0a0-0000-4000-8000-000000000001";
    const service = w.root.withSession({ principal: "service", org_id: null, store_id: null, user_id: null, terminal_id: null });
    await refused(c.auth_user_link(w.owner, { p_kind: "user", p_row_id: w.jm.user_id, p_auth_user_id: authId }), "role_refused");
    await refused(c.auth_user_link(w.root.withSession(sysadminSession), { p_kind: "user", p_row_id: w.jm.user_id, p_auth_user_id: authId }), "role_refused");
    await expect(c.auth_user_link(service, { p_kind: "user", p_row_id: w.jm.user_id, p_auth_user_id: authId })).resolves.toEqual({ kind: "user", row_id: w.jm.user_id });
    await expect(c.auth_user_link(service, { p_kind: "store", p_row_id: w.A.store_id, p_auth_user_id: "a0a0a0a0-0000-4000-8000-000000000002" })).resolves.toEqual({ kind: "store", row_id: w.A.store_id });
    expect(w.root.inspect().users.find((u) => u.user_id === w.jm.user_id)!.auth_user_id).toBe(authId);
  });
});

describe("A-93 — nothing this order adds puts a PIN in an error", () => {
  it("a refused user_set_pin's error, serialised, contains no digit of the PIN", async () => {
    const w = await world();
    const err = await refused(c.user_set_pin(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id, p_pin: "1111" }), "pin_clash");
    // The stack is left out: its line numbers are digits that are not the PIN.
    const { request_id, ...rest } = { ...err, message: err.message };
    expect(request_id).toMatch(UUID);
    expect(JSON.stringify(rest)).not.toMatch(/1/);
  });

  it("a malformed PIN's invalid_input error does not echo it", async () => {
    const w = await world();
    const err = await failed(c.user_set_pin(w.owner, { ...w.asOwner, p_user_id: w.jm.user_id, p_pin: "78a6" }));
    expect(err.code).toBe("invalid_input");
    // request_id is a uuid, which may itself contain "78a6".
    const { request_id: _id, ...rest } = { ...err, message: err.message, stack: err.stack };
    expect(JSON.stringify(rest)).not.toContain("78a6");
  });
});

describe("A-40 — the tenant is re-asserted in the function: the fake refuses a call whose session carries no Organization (A-4)", () => {
  it("a null Organization is refused", async () => {
    const w = await world();
    const orphan = w.root.withSession({ principal: "person", org_id: null, store_id: null, user_id: w.ownerId, terminal_id: null });
    await refused(c.user_add(orphan, { ...w.asOwner, ...employee("K. Park", "KP", [w.A.store_id]) }), "no_tenant");
    await refused(c.user_add(createFakeClient(), { ...w.asOwner, ...employee("K. Park", "KP", [w.A.store_id]) }), "no_tenant");
  });

  it("another Organization's rows are not found from this one", async () => {
    const w = await world();
    const org2 = await c.organization_create(w.root.withSession(sysadminSession), { p_actor_user_id: SYSADMIN, p_name: "Other", p_owner_name: "O. Ther", p_owner_email: "o@example.test" });
    const other = w.root.withSession(person(org2.org_id, org2.owner_user_id));
    await refused(c.user_deactivate(other, { p_actor_user_id: org2.owner_user_id, p_actor_initials: null, p_terminal_id: null, p_manager_pin: null, p_user_id: w.yn.user_id }), "not_found");
  });

  it("on a personal session the actor is the session holder (§6)", async () => {
    const w = await world();
    await refused(c.user_add(w.owner, { ...w.asOwner, p_actor_user_id: w.jm.user_id, ...employee("K. Park", "KP", [w.A.store_id]) }), "actor_mismatch");
  });
});

describe("conventions §5 (M1 contracts order row 29) — createFakeClient({ session }) and withSession: a test states every principal it acts as, over one state", () => {
  it("an Employee added on the Owner's personal session resolves on the Store's store session", async () => {
    const w = await world();
    expect(w.storeA.session).toMatchObject({ principal: "store", store_id: w.A.store_id });
    expect(w.owner.session).toMatchObject({ principal: "person", user_id: w.ownerId });
    await c.user_add(w.owner, { ...w.asOwner, ...employee("K. Park", "KP", [w.A.store_id]) });
    await expect(c.actor_resolve(w.storeA, { p_initials: "KP", p_terminal_id: w.t1 })).resolves.toMatchObject({ display_name: "K. Park" });
  });
});

describe("conventions §5 (M1 contracts order row 30) — one SQLSTATE and one message key per kind of refusal, as the table says", () => {
  it("REFUSALS is exactly conventions §5's table", () => {
    const text = readFileSync(join(__dirname, "../docs/build/conventions.md"), "utf8");
    const table = text.split("**Refusals (M1 contracts order, row 30).**")[1]!.split("\n\n")[1]!;
    const fromDoc: Record<string, string> = {};
    for (const line of table.split("\n").slice(2)) {
      const cells = line.split("|").map((s) => s.trim());
      const code = cells[2]!.replace(/`/g, "");
      for (const key of cells[3]!.match(/`([a-z_]+)`/g) ?? []) fromDoc[key.replace(/`/g, "")] = code;
    }
    expect(REFUSALS).toEqual(fromDoc);
  });
});

function pascal(s: string) {
  return s.replace(/(^|_)([a-z0-9])/g, (_, __, ch: string) => ch.toUpperCase());
}
