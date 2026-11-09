// S-01 D M1, rows 16 and 26 — the S functions through PostgREST, under a real
// System Administrator's passkey token.
//
// What pgTAP cannot show: that the JWT `role` claim the hook mints selects the
// Postgres `sysadmin` role and that role's grant reaches `app.organization_create`
// (A-90, A-110); and that the Owner it writes, once linked (A-91's write-back),
// signs in through a link as an enrolment session — A-131's window, opened by
// organization_create, is what the hook reads (E-01-T16's fixture precondition).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
//
// Pass 2 (rows 27 and 30): two owner_recover calls racing on one Owner-less
// Organization, forced to overlap on the Organization's row (A-144, S-01 d12);
// and the Owner a replacement deactivates losing their next token (A-146, A-122).
import { authCall, claims, createAuthUser, deleteAuthUser, exec, linkSession, read, refresh, rest, runId } from "./harness";
import { enrolAndSignIn, passkeyPage } from "./browser";
import { link, makeOrg, type Org } from "./fixtures";
import { holding, self, until, waiting, waitingSql } from "./race";

const ours = (jwt: string) => {
  const c = claims(jwt);
  return { role: c.role ?? null, principal: c.principal ?? null, org_id: c.org_id ?? null, store_id: c.store_id ?? null, user_id: c.user_id ?? null };
};
const amr = (jwt: string) => ((claims(jwt).amr as { method: string }[] | undefined) ?? []).map((a) => a.method);

let host: Org;
let sysadminId: string;
let sysadminToken: string;
const run = runId();
const ownerEmail = `s01-owner-${run}@wx.test`;
let created: { org_id: string; owner_user_id: string } | undefined;
let ownerAuth: string | undefined;

beforeAll(async () => {
  // One active System Administrator, with an Auth user and a window set by hand
  // (the runbook's act, A-110, A-134); the host Organization is unused here.
  host = await makeOrg(run, [], [{ active: true }]);
  sysadminId = host.sysadmins[0]!;
  const admin = await authCall(`/admin/users/${sysadminId}`, { method: "GET", key: "secret" });
  const page = await passkeyPage();
  try {
    const l = await linkSession(admin.body.email as string);
    expect(l.status, JSON.stringify(l.body)).toBe(200);
    const r = await enrolAndSignIn(page.page, { access_token: l.body.access_token as string, refresh_token: l.body.refresh_token as string });
    expect(r.registered.error).toBeNull();
    expect(r.signedIn.error).toBeNull();
    sysadminToken = r.signedIn.access_token!;
  } finally {
    await page.close();
  }
});

afterAll(async () => {
  if (created) {
    exec(`
      delete from public.users where org_id = '${created.org_id}';
      delete from public.organizations where id = '${created.org_id}';
    `);
  }
  if (ownerAuth) await deleteAuthUser(ownerAuth);
  await host?.cleanup();
});

describe("S-01 D M1 row 26 — A-90: a System Administrator's passkey session calls organization_create through PostgREST", () => {
  it("S-01 d2 — the JWT role selects the sysadmin Postgres role, whose grant reaches app.organization_create: 200 and {org_id, owner_user_id}", async () => {
    console.log(`S-01 sysadmin token claims: ${JSON.stringify({ ...ours(sysadminToken), sub: claims(sysadminToken).sub, amr: amr(sysadminToken) })}`);
    expect(ours(sysadminToken)).toEqual({ role: "sysadmin", principal: "sysadmin", org_id: null, store_id: null, user_id: null });
    expect(amr(sysadminToken)).toContain("passkey");
    expect(claims(sysadminToken).sub).toBe(sysadminId);
    const r = await rest("/rpc/organization_create", sysadminToken, {
      method: "POST",
      schema: "app",
      body: { p_actor_user_id: sysadminId, p_request_id: randomUUID(), p_name: `S-01 Records ${run}`, p_owner_name: "Sol Owner", p_owner_email: ownerEmail },
    });
    console.log(`S-01 organization_create -> ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["org_id", "owner_user_id"]);
    created = r.body as { org_id: string; owner_user_id: string };
  });

  it("A-113 — the same token naming another actor is refused actor_mismatch (403)", async () => {
    const r = await rest("/rpc/organization_create", sysadminToken, {
      method: "POST",
      schema: "app",
      body: { p_actor_user_id: randomUUID(), p_request_id: randomUUID(), p_name: "Never", p_owner_name: "Never", p_owner_email: `never-${run}@wx.test` },
    });
    console.log(`S-01 organization_create, another actor -> ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "28000", message: "actor_mismatch" });
  });
});

describe("S-01 D M1 row 16 — A-131: the Owner organization_create wrote signs in through a link as an enrolment session", () => {
  let enrolmentToken: string;

  it("A-131 — after auth_user_link('user', …), the Owner's link session is principal enrolment, naming the Owner (E-01-T16's precondition)", async () => {
    expect(created, "organization_create ran").toBeDefined();
    // A-91: the Server Action's Auth half — an Auth user for the address, then the write-back (A-114).
    ownerAuth = await createAuthUser(ownerEmail);
    await link("user", created!.owner_user_id, ownerAuth);
    const r = await linkSession(ownerEmail);
    console.log(`S-01 Owner link session -> ${r.status} ${JSON.stringify(r.status === 200 ? ours(r.body.access_token as string) : r.body)}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    enrolmentToken = r.body.access_token as string;
    expect(ours(enrolmentToken)).toEqual({ role: "authenticated", principal: "enrolment", org_id: null, store_id: null, user_id: created!.owner_user_id });
  });

  it("A-90 — under that enrolment-session token owner_reset_request is refused 403: the authenticated role holds no grant on it", async () => {
    const r = await rest("/rpc/owner_reset_request", enrolmentToken, {
      method: "POST",
      schema: "app",
      body: { p_actor_user_id: created!.owner_user_id, p_request_id: randomUUID(), p_org_id: created!.org_id, p_user_id: created!.owner_user_id },
    });
    console.log(`S-01 owner_reset_request under an enrolment session -> ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "42501" });
  });

  it("S-01 d3 — and under the System Administrator's token it is accepted, returning the address the link goes to", async () => {
    const r = await rest("/rpc/owner_reset_request", sysadminToken, {
      method: "POST",
      schema: "app",
      body: { p_actor_user_id: sysadminId, p_request_id: randomUUID(), p_org_id: created!.org_id, p_user_id: created!.owner_user_id },
    });
    console.log(`S-01 owner_reset_request under the sysadmin session -> ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ user_id: created!.owner_user_id, email: ownerEmail });
  });
});

/**
 * owner_recover under the System Administrator's token, through PostgREST's app
 * schema. p_replace_user_id is sent only when given: the argument defaults to
 * null (A-146), and a plain recovery names the same arguments it did before it.
 */
function recover(args: { p_org_id: string; p_user_id?: string | null; p_owner_name?: string | null; p_owner_email?: string | null; p_replace_user_id?: string }) {
  return rest("/rpc/owner_recover", sysadminToken, {
    method: "POST",
    schema: "app",
    body: { p_actor_user_id: sysadminId, p_request_id: randomUUID(), p_user_id: null, p_owner_name: null, p_owner_email: null, ...args },
  });
}

describe("S-01 D M1 row 27 — A-144, S-01 d12: two owner_recover calls on one Owner-less Organization serialise on its row", () => {
  const raceRun = runId();
  const orgId = randomUUID();
  const goneId = randomUUID();
  const goneEmail = `s01-gone-${raceRun}@wx.test`;

  beforeAll(() => {
    // An Organization whose only Owner is deactivated and never enrolled — the
    // state S-01 d3's plain recovery is for, written by hand (no product act
    // reaches it: M-04 d26).
    exec(`
      insert into public.organizations (id, name) values ('${orgId}', 'S-01 race ${raceRun}');
      insert into public.users (id, org_id, role, initials, display_name, email, active)
        values ('${goneId}', '${orgId}', 'owner', 'OG', 'Owen Gone', '${goneEmail}', false);
    `);
  });

  afterAll(() => {
    exec(`
      delete from public.users where org_id = '${orgId}';
      delete from public.organizations where id = '${orgId}';
    `);
  });

  it("A-144 — both wait on the Organization's row; one reactivates (invite: true), the other is refused invalid_state / active_owner; one entry each", async () => {
    expect(sysadminToken, "the System Administrator signed in").toBeDefined();
    // The blocker holds the Organization's row; each owner_recover's first lock
    // after its header is that row, so both are seen waiting before it commits.
    const b = await holding(orgId, `s01_${raceRun}`, `${waitingSql("owner_recover", self)} >= 2`, "organizations");
    let r1!: Awaited<ReturnType<typeof rest>>;
    let r2!: Awaited<ReturnType<typeof rest>>;
    try {
      const one = recover({ p_org_id: orgId, p_user_id: goneId });
      await until("the first owner_recover to wait on the Organization's row", b, () => waiting("owner_recover", b) === 1);
      const two = recover({ p_org_id: orgId, p_user_id: goneId });
      const [a, c, rb] = await Promise.all([one, two, b.done]);
      r1 = a;
      r2 = c;
      expect(rb.status, `blocker: ${rb.out}`).toBe(0);
    } finally {
      await b.stop();
    }
    console.log(`S-01 race: first owner_recover -> ${r1.status} ${JSON.stringify(r1.body)}`);
    console.log(`S-01 race: second owner_recover -> ${r2.status} ${JSON.stringify(r2.body)}`);
    const results = [r1, r2].map((r) => ({ status: r.status, body: r.body }));
    expect(results).toContainEqual({ status: 200, body: { user_id: goneId, invite: true, email: goneEmail } });
    expect(results).toContainEqual({ status: 400, body: expect.objectContaining({ code: "WX409", message: "invalid_state", details: "active_owner" }) });
    const logs = read<{ org: string[]; person: string[] }>(
      `select (select coalesce(array_agg(e ->> 'action' order by n), '{}') from public.organizations o, jsonb_array_elements(o.log) with ordinality x(e, n) where o.id = '${orgId}') as org,
              (select coalesce(array_agg(e ->> 'action' order by n), '{}') from public.users u, jsonb_array_elements(u.log) with ordinality x(e, n) where u.id = '${goneId}') as person`,
    )[0]!;
    console.log(`S-01 race: after ${JSON.stringify(logs)}`);
    expect(logs.org).toEqual(["owner_reactivated"]);
    expect(logs.person).toEqual(["reactivated", "invite_sent"]);
  });
});

describe("S-01 D M1 row 30 — A-146, A-122: the Owner a replacement deactivates is refused their next token", () => {
  let org: Org;
  const replRun = runId();
  const newEmail = `s01-new-${replRun}@wx.test`;

  beforeAll(async () => {
    // An active, linked Owner with an open link (the fixture's window).
    org = await makeOrg(replRun, [{ key: "o1", role: "owner", initials: "O1", stores: ["A"] }]);
  });

  afterAll(async () => {
    await org?.cleanup();
  });

  it("A-122 — before the replacement the Owner's session refreshes; after owner_recover replaces them, the hook refuses the refresh", async () => {
    const o1 = org.people.o1!;
    const s = await linkSession(o1.email);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const before = await refresh(s.body.refresh_token as string);
    console.log(`S-01 replaced Owner, refresh before -> ${before.status} ${JSON.stringify(before.status === 200 ? ours(before.body.access_token as string) : before.body)}`);
    expect(before.status).toBe(200);
    const r = await recover({ p_org_id: org.orgId, p_owner_name: "Rex New", p_owner_email: newEmail, p_replace_user_id: o1.id });
    console.log(`S-01 owner_recover replacing O1 by invite -> ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ invite: true, email: newEmail });
    const after = await refresh(before.body.refresh_token as string);
    console.log(`S-01 replaced Owner, refresh after -> ${after.status} ${JSON.stringify(after.body)}`);
    expect(after.status).toBeGreaterThanOrEqual(400);
    expect(after.body.access_token).toBeUndefined();
    const owners = read<{ display_name: string; active: boolean }>(
      `select display_name, active from public.users where org_id = '${org.orgId}' and role = 'owner' order by active desc`,
    );
    expect(owners).toEqual([{ display_name: "Rex New", active: true }, { display_name: "o1", active: false }]);
  });
});
