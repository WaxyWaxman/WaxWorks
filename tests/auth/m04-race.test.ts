// M-04 D M1, rows 47, 53 and 55 — two sessions at once, through PostgREST.
//
// A-138's lock order and A-140's re-check exist for races one pgTAP session
// cannot show. Here each act is a real request (one PostgREST transaction each),
// and the overlap is forced, not hoped for:
//
//   * a third connection (the "blocker", `supabase db query` as postgres) takes
//     one row FOR NO KEY UPDATE, then names itself in pg_stat_activity
//     (application_name), so the test knows the row is held — not guesses;
//   * the requests that must wait are started and seen waiting on a lock;
//   * the blocker commits when the condition it was given holds (both waiting,
//     or a third act committed), and the waiting act then runs to its end.
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
// Finding 39 (a flake: the wait for the blocker timed out once, and the blocker
// was then never awaited): the hold is now signalled, not sampled; a blocker
// that ends early fails the wait at once with its output — or, if it ended
// before holding anything, is started again (holding(), below); and whatever
// happens, the blocker is killed and awaited before the test returns.
//
// Rework pass 4: a request is counted as waiting only in the chain of lock waits
// rooted at this blocker (finding 59); stopping a blocker also ends its backend,
// and only an end seen before the stop is retried (finding 52).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkSession, passwordSignIn, rest, runId, sql, supabaseCommand } from "./harness";
import { enrolAndSignIn, passkeyPage } from "./browser";
import { makeOrg, type Org } from "./fixtures";

interface Blocker {
  /** The tag its SQL carries and, once it holds its row, its application_name's suffix. */
  tag: string;
  /** Resolves when the blocker's connection has ended. */
  done: Promise<{ status: number | null; out: string }>;
  /** Whether it has ended, and what it printed so far. */
  ended(): boolean;
  out(): string;
  /** Ends it, if it has not ended, and waits for that; a blocker also ends its backend. */
  stop(): Promise<void>;
}

/**
 * Starts one statement as postgres on its own connection. Finding 52 asked
 * whether, under `shell: true` on Windows, `child.kill()` leaves the CLI and its
 * connection alive. Measured 2026-11-03 (supabase 2.117.0): `kill()` ended both
 * CLI processes and the backend within 1.5 s, while `taskkill /T /F` ended the
 * processes and left the backend sleeping. So `kill()` stays, and a blocker's
 * stop also ends its backend by its tag (below), whichever way the CLI ended.
 */
function background(text: string, tag: string): Blocker {
  const dir = mkdtempSync(join(tmpdir(), "wx-race-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, text, "utf8");
  const c = supabaseCommand(["db", "query", "--local", "-f", file]);
  const child = spawn(c.command, c.args, { shell: c.shell });
  let out = "";
  let ended = false;
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", (d) => (out += String(d)));
  const done = new Promise<{ status: number | null; out: string }>((resolve) => {
    child.on("close", (status) => {
      ended = true;
      rmSync(dir, { recursive: true, force: true });
      resolve({ status, out });
    });
  });
  return {
    tag,
    done,
    ended: () => ended,
    out: () => out,
    async stop() {
      if (!ended) child.kill();
      await done;
    },
  };
}

/**
 * The blocker: takes `rowId` FOR NO KEY UPDATE, sets application_name to
 * `wx_race_hold_<tag>` (pg_stat_activity shows it at once), and commits when
 * `release` — a boolean SQL expression — is true.
 */
function blocker(rowId: string, tag: string, release: string): Blocker {
  const b = background(`do $wx$ /* wx_race_blocker ${tag} */
declare t0 timestamptz := clock_timestamp();
begin
  perform 1 from public.users where id = '${rowId}' for no key update;
  perform pg_catalog.set_config('application_name', 'wx_race_hold_${tag}', false);
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when ${release};
    if clock_timestamp() - t0 > interval '45 seconds' then
      raise exception 'wx_race_blocker_timeout';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end $wx$`, tag);
  return {
    ...b,
    async stop() {
      await b.stop();
      // Whatever ended the CLI, its backend ends too, so nothing queues behind an
      // orphan until the loop's own timeout (finding 52).
      sql(`select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity
            where query like '%wx_race_blocker ${tag} %' and pid <> pg_catalog.pg_backend_pid()`);
    },
  };
}

const count = (where: string) =>
  sql<{ n: number }>(`select count(*)::int as n from pg_catalog.pg_stat_activity where ${where}`)[0]!.n;
const blockerHolds = (tag: string) => count(`application_name = 'wx_race_hold_${tag}'`);
/**
 * Requests calling `fn` that wait on a lock behind this blocker — directly, or
 * behind a request that does — so another session calling `fn` on the same stack
 * is never counted (finding 59). `root` is the blocker's pid as SQL: its own
 * `pg_backend_pid()` inside its release check, its application_name from outside.
 */
const waitingSql = (fn: string, root: string) =>
  `(with recursive chain(pid) as (select ${root}
      union select a.pid from pg_catalog.pg_stat_activity a join chain c on c.pid = any(pg_catalog.pg_blocking_pids(a.pid)))
    select count(*) from pg_catalog.pg_stat_activity a join chain c on c.pid = a.pid
     where a.wait_event_type = 'Lock' and a.query like '%${fn}%')`;
/** The release check's root: the blocker itself. */
const self = "pg_catalog.pg_backend_pid()";
const waiting = (fn: string, b: Blocker) =>
  sql<{ n: number }>(
    `select ${waitingSql(fn, `(select pid from pg_catalog.pg_stat_activity where application_name = 'wx_race_hold_${b.tag}')`)}::int as n`,
  )[0]!.n;

/** Polls `test` until it holds; fails at once, with the blocker's output, if the blocker has ended. */
async function until(what: string, b: Blocker, test: () => boolean, ms = 30_000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    if (test()) return;
    if (b.ended()) throw new Error(`the blocker ended while waiting for ${what}: ${b.out()}`);
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}; blocker so far: ${b.out() || "(nothing)"}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Starts the blocker and waits until it holds its row. A blocker whose CLI ends
 * before it signals the hold has held nothing — no request has started — so it
 * is started again, at most twice, and each early end's output is printed.
 * Observed once in eight runs (2026-11-01, finding 39): the CLI process
 * (`supabase.exe` 2.117.0, a compiled wrapper beside `supabase-go.exe`) ended
 * before connecting, printing a JavaScript code frame. Anything after the hold
 * is never retried: there, an early end fails the test with its output. Only an
 * end seen before this side stops it counts as early: a timeout with a live
 * blocker is not retried (finding 52).
 */
async function holding(rowId: string, tag: string, release: string): Promise<Blocker> {
  for (let attempt = 1; ; attempt++) {
    const t = `${tag}_${attempt}`;
    const b = blocker(rowId, t, release);
    try {
      await until(`the blocker to hold its row (attempt ${attempt})`, b, () => blockerHolds(t) === 1);
      return b;
    } catch (e) {
      const endedByItself = b.ended(); // read before stop(), which always ends it
      await b.stop();
      const early = endedByItself && blockerHolds(t) === 0;
      console.log(`race blocker attempt ${attempt} ended before holding its row: ${String(e)}`);
      if (!early || attempt >= 3) throw e;
    }
  }
}

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
    sql<{ display_name: string; role: string; active: boolean }>(
      `select display_name, role, active from public.users where org_id = '${org.orgId}' order by display_name`,
    ).map((u) => [u.display_name, `${u.role}${u.active ? "" : " (inactive)"}`]),
  );
const activeOwners = (org: Org) =>
  sql<{ n: number }>(`select count(*)::int as n from public.users where org_id = '${org.orgId}' and role = 'owner' and active`)[0]!.n;

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
    const o3log = sql<{ n: number }>(`select count(*)::int as n from public.users u, jsonb_array_elements(u.log) e
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
      sql<{ set_by: string; is_new: boolean }>(
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
