// M-04 D M1, rows 47, 53 and 55 — two sessions at once, through PostgREST.
//
// A-138's lock order and A-140's re-check exist for races one pgTAP session
// cannot show. Here each act is a real request (one PostgREST transaction each),
// and the overlap is forced, not hoped for, by a blocker (./race.ts).
//
// Rows 47 and 53: two demotions on the store session. The blocker holds the
// highest-id active Owner row; the first request takes lock_active_owners' locks
// in id order (A-138 step 2) and waits on it; the second passes its header — its
// authoriser still an Owner — and waits behind the first. The first always wins,
// and the second meets the first's commit after its own header.
//
// Row 55 (M-04 d59): an Owner's Set PIN on their personal session waits on its
// subject's row while a second Owner demotes the first; the PIN is recorded as
// the re-check reads its setter after the wait — a Manager.

//
// The blocker, its waits and its repairs (findings 39, 52, 59, 63, 70, 72) live in
// ./race.ts since S-01 D M1 row 27, which races on the Organization's row too.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { linkSession, passwordSignIn, read, rest, runId, sql } from "./harness";
import { enrolAndSignIn, passkeyPage } from "./browser";
import { makeOrg, type Org } from "./fixtures";
import { holding, self, until, waiting, waitingSql } from "./race";

interface Race {
  org: Org;
  token: string;
}

async function storeSession(org: Org): Promise<string> {
  const r = await passwordSignIn(org.storeAccount.email, org.storeAccount.password);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.access_token as string;
}

/** A personal session (E-01 d27): the link's session, then a passkey made and signed in with (A-126). */
async function personalSession(email: string): Promise<string> {
  const page = await passkeyPage();
  try {
    const link = await linkSession(email);
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    const r = await enrolAndSignIn(page.page, { access_token: link.body.access_token as string, refresh_token: link.body.refresh_token as string });
    expect(r.registered.error).toBeNull();
    expect(r.signedIn.error).toBeNull();
    return r.signedIn.access_token!;
  } finally {
    await page.close();
  }
}

/** A demotion to Manager at Store A's till, authorised by `pin`, under EE's staff session. */
function demote(race: Race, pin: string, subject: string) {
  return rest("/rpc/user_change_role", race.token, {
    method: "POST",
    schema: "app",
    body: {
      p_actor_user_id: race.org.people.employee!.id,
      p_actor_initials: "EE",
      p_request_id: randomUUID(),
      p_terminal_id: race.org.terminalA,
      p_manager_pin: pin,
      p_user_id: subject,
      p_role: "manager",
      p_email: null,
      p_pin: null,
    },
  });
}

/** One of the identity functions on a personal session: the session holder is actor and authoriser (M-04 d31). */
function atDesk(fn: string, token: string, actor: string, args: Record<string, unknown>) {
  return rest(`/rpc/${fn}`, token, {
    method: "POST",
    schema: "app",
    body: { p_actor_user_id: actor, p_actor_initials: null, p_request_id: randomUUID(), p_terminal_id: null, p_manager_pin: null, ...args },
  });
}

const roles = (org: Org) =>
  Object.fromEntries(
    read<{ display_name: string; role: string; active: boolean }>(
      `select display_name, role, active from public.users where org_id = '${org.orgId}' order by display_name`,
    ).map((u) => [u.display_name, `${u.role}${u.active ? "" : " (inactive)"}`]),
  );
const activeOwners = (org: Org) =>
  read<{ n: number }>(`select count(*)::int as n from public.users where org_id = '${org.orgId}' and role = 'owner' and active`)[0]!.n;

/**
 * Rows 47 and 53, as the module comment describes: the blocker on `hold` (the
 * highest-id active Owner), the first request waiting on it, then the second
 * waiting behind the first; the blocker commits when both wait.
 */
async function race(hold: string, tag: string, first: () => ReturnType<typeof rest>, second: () => ReturnType<typeof rest>) {
  const b = await holding(hold, tag, `${waitingSql("user_change_role", self)} >= 2`);
  try {
    const one = first();
    await until("the first request to wait on the Owners' lock", b, () => waiting("user_change_role", b) === 1);
    const two = second();
    const [r1, r2, rb] = await Promise.all([one, two, b.done]);
    expect(rb.status, `blocker: ${rb.out}`).toBe(0);
    return [r1, r2] as const;
  } finally {
    await b.stop();
  }
}

let two: Race;
let three: Race;

beforeAll(async () => {
  const o2 = await makeOrg(runId(), [
    { key: "employee", role: "employee", initials: "EE", stores: ["A"] },
    { key: "o1", role: "owner", initials: "O1", stores: ["A"], pin: "4101" },
    { key: "o2", role: "owner", initials: "O2", stores: ["A"], pin: "4102" },
  ]);
  two = { org: o2, token: await storeSession(o2) };
  const o3 = await makeOrg(runId(), [
    { key: "employee", role: "employee", initials: "EE", stores: ["A"] },
    { key: "o1", role: "owner", initials: "O1", stores: ["A"], pin: "4201" },
    { key: "o2", role: "owner", initials: "O2", stores: ["A"], pin: "4202" },
    { key: "o3", role: "owner", initials: "O3", stores: ["A"], pin: "4203" },
  ]);
  three = { org: o3, token: await storeSession(o3) };
});

afterAll(async () => {
  await two?.org.cleanup();
  await three?.org.cleanup();
});

describe("M-04 D M1 row 47 — A-138: two Owners demoting each other at once (M-04 d26)", () => {
  it("A-138 — one demotion is accepted, the other is refused owner_floor, and the Organization keeps an active Owner", async () => {
    const p = two.org.people;
    // The first request is O1's PIN demoting O2; the second, O2's demoting O1.
    const hold = [p.o1!.id, p.o2!.id].sort().at(-1)!;
    const [r1, r2] = await race(hold, `two_${runId()}`, () => demote(two, "4101", p.o2!.id), () => demote(two, "4102", p.o1!.id));
    console.log(`A-138 race: O1 demotes O2 -> ${r1.status} ${JSON.stringify(r1.body)}`);
    console.log(`A-138 race: O2 demotes O1 -> ${r2.status} ${JSON.stringify(r2.body)}`);
    console.log(`A-138 race: after ${JSON.stringify(roles(two.org))}, active Owners ${activeOwners(two.org)}`);
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ user_id: p.o2!.id, invite: false, email: null });
    expect(r2.status).toBe(400);
    expect(r2.body).toMatchObject({ code: "23514", message: "owner_floor" });
    expect(activeOwners(two.org)).toBe(1);
    expect(roles(two.org)).toMatchObject({ o1: "owner", o2: "manager" });
  });
});

describe("M-04 D M1 row 53 — A-140: the authoriser is re-checked after the last lock (finding 24)", () => {
  it("A-140 — O1 demotes O2 while O2's demotion of O3 waits on the Owners' lock: O2's act is refused role_refused / owner, O3 still an Owner", async () => {
    const p = three.org.people;
    const hold = [p.o1!.id, p.o2!.id, p.o3!.id].sort().at(-1)!;
    const [r1, r2] = await race(hold, `three_${runId()}`, () => demote(three, "4201", p.o2!.id), () => demote(three, "4202", p.o3!.id));
    console.log(`A-140 race: O1 demotes O2 -> ${r1.status} ${JSON.stringify(r1.body)}`);
    console.log(`A-140 race: O2 demotes O3 -> ${r2.status} ${JSON.stringify(r2.body)}`);
    console.log(`A-140 race: after ${JSON.stringify(roles(three.org))}`);
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ user_id: p.o2!.id, invite: false, email: null });
    expect(r2.status).toBe(403); // finding 57: the status, not only the body
    expect(r2.body).toMatchObject({ code: "42501", message: "role_refused", details: "owner" });
    expect(roles(three.org)).toMatchObject({ o1: "owner", o2: "manager", o3: "owner" });
    // Nothing of O2's refused act was written: O3's log holds no role_changed.
    const o3log = read<{ n: number }>(`select count(*)::int as n from public.users u, jsonb_array_elements(u.log) e
                                       where u.id = '${p.o3!.id}' and e ->> 'action' = 'role_changed'`)[0]!.n;
    expect(o3log).toBe(0);
  });
});

describe("M-04 D M1 row 55 — M-04 d59: the setter recorded is the authoriser's role as the re-check reads it after the wait", () => {
  let org: Org;
  let x: string;
  let y: string;

  beforeAll(async () => {
    // X and Y, Owners at A; Mo, a Manager at A. Each holds a PIN (a demotion into
    // Manager needs one held, M-04 d35); the fixture's count as a Manager's.
    org = await makeOrg(runId(), [
      { key: "x", role: "owner", initials: "OX", stores: ["A"], pin: "4311" },
      { key: "y", role: "owner", initials: "OY", stores: ["A"], pin: "4312" },
      { key: "mo", role: "manager", initials: "MO", stores: ["A"], pin: "4313" },
    ]);
    // Finding 50: Mo's fixture PIN is made Owner-set, so a set_by of 'manager'
    // after the race can only be the race's own write, not the fixture's default.
    sql(`update public.user_pins set set_by = 'owner' where user_id = '${org.people.mo!.id}'`);
    x = await personalSession(org.people.x!.email);
    y = await personalSession(org.people.y!.email);
  });

  afterAll(async () => {
    await org?.cleanup();
  });

  it("M-04 d59 — X, an Owner, sets Mo's PIN while Y demotes X during the wait: accepted, set_by = 'manager'; Mo's promotion into Owner then requires a new PIN (M-04 d55)", async () => {
    const p = org.people;
    const tag = `d59_${runId()}`;
    const pinOf = () =>
      read<{ set_by: string; is_new: boolean }>(
        `select p.set_by, p.pin_hash = app_internal.pin_hash('4399') as is_new from public.user_pins p where p.user_id = '${p.mo!.id}'`,
      )[0];
    expect(pinOf(), "Mo's fixture PIN, before the race (finding 50)").toEqual({ set_by: "owner", is_new: false });
    // Held: Mo's row, the subject X's Set PIN locks at A-138 step 3. Released once
    // Y's demotion of X has committed while X's act waits.
    const b = await holding(p.mo!.id, tag,
      `${waitingSql("user_set_pin", self)} >= 1 and (select role from public.users where id = '${p.x!.id}') = 'manager'`);
    let set!: Awaited<ReturnType<typeof rest>>;
    let demoted!: Awaited<ReturnType<typeof rest>>;
    try {
      const setting = atDesk("user_set_pin", x, p.x!.id, { p_user_id: p.mo!.id, p_pin: "4399" });
      await until("X's Set PIN to wait on Mo's row", b, () => waiting("user_set_pin", b) === 1);
      demoted = await atDesk("user_change_role", y, p.y!.id, { p_user_id: p.x!.id, p_role: "manager", p_email: null, p_pin: null });
      const [r, rb] = await Promise.all([setting, b.done]);
      set = r;
      expect(rb.status, `blocker: ${rb.out}`).toBe(0);
    } finally {
      await b.stop();
    }
    const pin = pinOf();
    const setBy = pin?.set_by;
    console.log(`M-04 d59 race: Y demotes X -> ${demoted.status} ${JSON.stringify(demoted.body)}`);
    console.log(`M-04 d59 race: X sets Mo's PIN -> ${set.status} ${JSON.stringify(set.body)}, set_by ${setBy}`);
    expect(demoted.status).toBe(200);
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ user_id: p.mo!.id });
    expect(roles(org)).toMatchObject({ x: "manager", y: "owner", mo: "manager" });
    expect(setBy).toBe("manager");
    expect(pin?.is_new, "Mo's PIN is the 4399 X's act wrote (finding 50)").toBe(true);
    // M-04 d55: a PIN a Manager set does not carry into Owner standing.
    const promoted = await atDesk("user_change_role", y, p.y!.id, { p_user_id: p.mo!.id, p_role: "owner", p_email: null, p_pin: null });
    console.log(`M-04 d59 race: Y promotes Mo into Owner without a new PIN -> ${promoted.status} ${JSON.stringify(promoted.body)}`);
    expect(promoted.status).toBe(400);
    expect(promoted.body).toMatchObject({ code: "23502", message: "pin_required" });
    expect(roles(org)).toMatchObject({ mo: "manager" });
  });
});
