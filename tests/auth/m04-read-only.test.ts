// M-04 D M1, row 12 — A-129 over HTTP: one of the ten user-administration
// functions called by GET runs in PostgREST's read-only transaction and is
// refused before any PIN is read, writing nothing.
//
// The function is user_correct, an M function on a store session. It was
// user_set_pin until M-04 d51 took every PIN-setting act off the till: at the
// till user_set_pin is refused role_refused / person before the guard, so it no
// longer reaches the path this test holds (pgTAP 0030 asserts that refusal).
// Nothing here prints a stored hash or a digit (A-93; review finding 10).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { passwordSignIn, rest, runId, sql } from "./harness";
import { makeOrg, type Org } from "./fixtures";

let org: Org;
let store = "";

beforeAll(async () => {
  org = await makeOrg(runId(), [
    { key: "employee", role: "employee", initials: "EE", stores: ["A"] },
    { key: "holder", role: "manager", initials: "HH", stores: ["A"], selected: "A", pin: "4321" },
    { key: "subject", role: "employee", initials: "SS", stores: ["A"] },
  ]);
  const r = await passwordSignIn(org.storeAccount.email, org.storeAccount.password);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  store = r.body.access_token as string;
});

afterAll(async () => {
  await org?.cleanup();
});

const state = () =>
  sql<{ refusals: number; log: number; name: string }>(`
    select (select count(*)::int from public.pin_refusals where org_id = '${org.orgId}') as refusals,
           (select jsonb_array_length(log) from public.users where id = '${org.people.subject!.id}') as log,
           (select display_name from public.users where id = '${org.people.subject!.id}') as name`)[0];

const args = (pin: string) => ({
  p_actor_user_id: org.people.employee!.id,
  p_actor_initials: "EE",
  p_request_id: randomUUID(),
  p_terminal_id: org.terminalA,
  p_manager_pin: pin,
  p_user_id: org.people.subject!.id,
  p_display_name: "Renamed",
});

describe("M-04 D M1 row 12 — A-129: a read-only transaction is refused before any PIN is read (E-01 D finding 41)", () => {
  it("A-129 — a GET of user_correct answers 405 read_only and writes nothing, a correct and a wrong PIN alike", async () => {
    const before = state();
    const params = (pin: string) => new URLSearchParams(args(pin)).toString();
    const right = await rest(`/rpc/user_correct?${params("4321")}`, store, { schema: "app" });
    const wrong = await rest(`/rpc/user_correct?${params("9999")}`, store, { schema: "app" });
    console.log(`A-129 GET user_correct, correct PIN: status ${right.status} ${JSON.stringify(right.body)}`);
    console.log(`A-129 GET user_correct, wrong PIN: status ${wrong.status} ${JSON.stringify(wrong.body)}`);
    for (const r of [right, wrong]) {
      expect(r.status).toBe(405);
      expect(r.body).toMatchObject({ code: "25006", message: "read_only" });
      expect(JSON.stringify(r.body)).not.toContain(org.people.holder!.id);
    }
    const after = state();
    // A-93: the state printed holds counts and a display name — no hash, no digit.
    console.log(`A-129 state before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    expect(after).toEqual(before);
    expect(after!.refusals).toBe(0);
  });

  it("A-129 — the same call by POST is not refused read_only: the guard is the transaction, not the function", async () => {
    const r = await rest("/rpc/user_correct", store, { method: "POST", schema: "app", body: args("4321") });
    console.log(`A-129 POST user_correct: status ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ user_id: org.people.subject!.id });
    expect(state()!.name).toBe("Renamed");
  });
});
