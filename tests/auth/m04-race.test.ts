// M-04 D M1, rows 47 and 53 — two sessions at once, through PostgREST.
//
// A-138's lock order and A-140's re-check exist for races one pgTAP session
// cannot show. Here each act is a real request on the store session (one
// PostgREST transaction each), and the overlap is forced, not hoped for:
//
//   * a third connection (the "blocker", `supabase db query` as postgres) holds
//     the highest-id active Owner row FOR NO KEY UPDATE;
//   * the first request passes its header, takes app_internal.lock_active_owners'
//     locks in id order (A-138 step 2) and waits on that last row;
//   * the second request passes its header — its authoriser is still an Owner —
//     and waits behind the first on the lowest row;
//   * the blocker sees both waiting and commits, and the first act runs to its
//     commit before the second wakes.
//
// So the first always wins and the second always meets the first's commit after
// its own header: exactly the window A-138 and A-140 close.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passwordSignIn, rest, runId, sql } from "./harness";
import { makeOrg, type Org } from "./fixtures";

const shell = process.platform === "win32";

/** Starts one statement as postgres on its own connection, and resolves when it ends. */
function background(text: string): Promise<{ status: number | null; out: string }> {
  const dir = mkdtempSync(join(tmpdir(), "wx-race-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, text, "utf8");
  return new Promise((resolve) => {
    const child = spawn("supabase", ["db", "query", "--local", "-f", file], { shell });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", (status) => {
      rmSync(dir, { recursive: true, force: true });
      resolve({ status, out });
    });
  });
}

/** The blocker: holds one Owner row until two user_change_role requests wait on a lock. */
function blocker(rowId: string, tag: string): Promise<{ status: number | null; out: string }> {
  return background(`do $wx$ /* wx_race_blocker ${tag} */
declare t0 timestamptz := clock_timestamp();
begin
  perform 1 from public.users where id = '${rowId}' for no key update;
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when (select count(*) from pg_catalog.pg_stat_activity
                where wait_event_type = 'Lock' and query like '%user_change_role%' and query not like '%wx_race_blocker%') >= 2;
    if clock_timestamp() - t0 > interval '30 seconds' then
      raise exception 'wx_race_blocker_timeout';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end $wx$`);
}

const count = (where: string) =>
  sql<{ n: number }>(`select count(*)::int as n from pg_catalog.pg_stat_activity where ${where}`)[0]!.n;
const blockerHolds = (tag: string) => count(`query like '%wx_race_blocker ${tag}%' and wait_event = 'PgSleep'`);
const waitingActs = () =>
  count(`wait_event_type = 'Lock' and query like '%user_change_role%' and query not like '%wx_race_blocker%' and query not like '%pg_stat_activity%'`);

async function until(what: string, test: () => boolean, ms = 30_000): Promise<void> {
  const t0 = Date.now();
  while (!test()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
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

const roles = (org: Org) =>
  Object.fromEntries(
    sql<{ display_name: string; role: string; active: boolean }>(
      `select display_name, role, active from public.users where org_id = '${org.orgId}' order by display_name`,
    ).map((u) => [u.display_name, `${u.role}${u.active ? "" : " (inactive)"}`]),
  );
const activeOwners = (org: Org) =>
  sql<{ n: number }>(`select count(*)::int as n from public.users where org_id = '${org.orgId}' and role = 'owner' and active`)[0]!.n;

/**
 * Runs `first` and `second` as the module comment describes: the blocker on
 * `hold` (the highest-id active Owner), the first request waiting on it, then
 * the second waiting behind the first.
 */
async function race(hold: string, tag: string, first: () => ReturnType<typeof rest>, second: () => ReturnType<typeof rest>) {
  const b = blocker(hold, tag);
  await until("the blocker to hold its row", () => blockerHolds(tag) === 1);
  const one = first();
  await until("the first request to wait on the Owners' lock", () => waitingActs() === 1);
  const two = second();
  const [r1, r2, rb] = await Promise.all([one, two, b]);
  expect(rb.status, `blocker: ${rb.out}`).toBe(0);
  return [r1, r2] as const;
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
    const [r1, r2] = await race(hold, `two-${runId()}`, () => demote(two, "4101", p.o2!.id), () => demote(two, "4102", p.o1!.id));
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
    const [r1, r2] = await race(hold, `three-${runId()}`, () => demote(three, "4201", p.o2!.id), () => demote(three, "4202", p.o3!.id));
    console.log(`A-140 race: O1 demotes O2 -> ${r1.status} ${JSON.stringify(r1.body)}`);
    console.log(`A-140 race: O2 demotes O3 -> ${r2.status} ${JSON.stringify(r2.body)}`);
    console.log(`A-140 race: after ${JSON.stringify(roles(three.org))}`);
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ user_id: p.o2!.id, invite: false, email: null });
    expect(r2.body).toMatchObject({ code: "42501", message: "role_refused", details: "owner" });
    expect(roles(three.org)).toMatchObject({ o1: "owner", o2: "manager", o3: "owner" });
    // Nothing of O2's refused act was written: O3's log holds no role_changed.
    const o3log = sql<{ n: number }>(`select count(*)::int as n from public.users u, jsonb_array_elements(u.log) e
                                       where u.id = '${p.o3!.id}' and e ->> 'action' = 'role_changed'`)[0]!.n;
    expect(o3log).toBe(0);
  });
});
