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
import { authCall, claims, createAuthUser, deleteAuthUser, exec, linkSession, rest, runId } from "./harness";
import { enrolAndSignIn, passkeyPage } from "./browser";
import { link, makeOrg, type Org } from "./fixtures";

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
