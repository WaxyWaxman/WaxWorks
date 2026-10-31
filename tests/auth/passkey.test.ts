// A-126's first task, not assumed: Supabase's experimental passkey API
// completing a ceremony under Chromium's virtual authenticator. Then the rows
// that need a passkey session: E-01 d33, A-117 and its *to verify* (a refreshed
// passkey session keeps `passkey` in `amr`), E-01 d36, A-110's sysadmin path,
// and E-01 d27's pick copied into the next token.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authCall, claims, linkSession, local, refresh, rest, runId, sql } from "./harness";
import { enrolAndSignIn, passkeyPage, type CeremonyResult } from "./browser";
import { makeOrg, type Org } from "./fixtures";

const amr = (jwt: string) => ((claims(jwt).amr as { method: string }[] | undefined) ?? []).map((a) => a.method);
const ours = (jwt: string) => {
  const c = claims(jwt);
  return { principal: c.principal ?? null, org_id: c.org_id ?? null, store_id: c.store_id ?? null, user_id: c.user_id ?? null };
};

/** A link's session, then a passkey made and signed in with, in a page of its own. */
async function enrol(email: string): Promise<CeremonyResult> {
  const browser = await passkeyPage();
  try {
    const link = await linkSession(email);
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    const result = await enrolAndSignIn(browser.page, {
      access_token: link.body.access_token as string,
      refresh_token: link.body.refresh_token as string,
    });
    console.log(`A-126 ceremony for ${email.split("-")[0]}: ${JSON.stringify({
      registered: result.registered, signedIn: { error: result.signedIn.error, has_token: result.signedIn.access_token !== null },
    })}`);
    return result;
  } finally {
    await browser.close();
  }
}

let org: Org;
let manager: CeremonyResult;
let owner: CeremonyResult;
let sysadmin: CeremonyResult;
/** The manager's newest refresh token: Auth rotates them (enable_refresh_token_rotation). */
let latestManagerRefresh = "";

beforeAll(async () => {
  org = await makeOrg(runId(), [
    { key: "manager", role: "manager", initials: "MM", stores: ["A"], selected: "A" },
    { key: "owner", role: "owner", initials: "OO", stores: [], selected: null },
  ], [{ active: true }]);
  manager = await enrol(org.people.manager!.email);
  owner = await enrol(org.people.owner!.email);
  const admin = await authCall(`/admin/users/${org.sysadmins[0]!}`, { method: "GET", key: "secret" });
  sysadmin = await enrol(admin.body.email as string);
});

afterAll(async () => {
  await org?.cleanup();
});

describe("A-126 — a passkey ceremony completes under Chromium's virtual authenticator", () => {
  it("A-126 — registration completes with the link's enrolment session, for a Manager, an Owner and a System Administrator", () => {
    expect(manager.registered.error).toBeNull();
    expect(owner.registered.error).toBeNull();
    expect(sysadmin.registered.error).toBeNull();
  });

  it("A-126 — signing in with the passkey just made returns a session (E-01 d37 step 10)", () => {
    expect(manager.signedIn.error).toBeNull();
    expect(manager.signedIn.access_token).not.toBeNull();
  });
});

describe("E-01 d33 — a Manager or Owner signs in to a personal session with a passkey", () => {
  it("E-01 d33 — the passkey token carries principal=person, org_id, user_id and the selected store_id (A-87)", () => {
    expect(amr(manager.signedIn.access_token!)).toContain("passkey");
    expect(ours(manager.signedIn.access_token!)).toEqual({
      principal: "person", org_id: org.orgId, store_id: org.storeA, user_id: org.people.manager!.id,
    });
  });

  it("A-117 — a passkey session refreshed twice keeps `passkey` in amr and stays principal=person (A-117's to verify)", async () => {
    let token = manager.signedIn.refresh_token!;
    for (let i = 1; i <= 2; i++) {
      const r = await refresh(token);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const access = r.body.access_token as string;
      console.log(`A-117 refresh ${i}: amr=${JSON.stringify(amr(access))} principal=${String(claims(access).principal)}`);
      expect(amr(access)).toContain("passkey");
      expect(claims(access).principal).toBe("person");
      token = r.body.refresh_token as string;
    }
    latestManagerRefresh = token;
  });
});

describe("A-117 — the enrolment is recorded through app.auth_user_link", () => {
  it("A-117 — Auth's admin API lists the person's passkey, and the passkey kind sets passkey_enrolled_at", async () => {
    const listed = await authCall(`/admin/users/${org.people.manager!.authId}/passkeys`, { method: "GET", key: "secret" });
    console.log(`A-117 admin passkeys: status ${listed.status} ${JSON.stringify(listed.body).slice(0, 160)}`);
    expect(listed.status).toBe(200);
    const s = local();
    const res = await fetch(`${s.url}/rest/v1/rpc/auth_user_link`, {
      method: "POST",
      headers: { apikey: s.secretKey, Authorization: `Bearer ${s.secretKey}`, "Content-Type": "application/json", "Content-Profile": "app" },
      body: JSON.stringify({ p_kind: "passkey", p_row_id: org.people.manager!.id, p_auth_user_id: org.people.manager!.authId, p_request_id: randomUUID() }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const rows = sql<{ enrolled: boolean }>(`select passkey_enrolled_at is not null as enrolled from public.users where id = '${org.people.manager!.id}'`);
    expect(rows[0]?.enrolled).toBe(true);
  });
});

describe("E-01 d36 — an Owner whose Organization has no Store picked signs in with no Store", () => {
  it("E-01 d36 — the personal session carries no store_id, and nothing store-dimensioned is read (E-01-T16)", async () => {
    expect(ours(owner.signedIn.access_token!)).toEqual({
      principal: "person", org_id: org.orgId, store_id: null, user_id: org.people.owner!.id,
    });
    const terminals = await rest("/terminals?select=id", owner.signedIn.access_token!);
    expect(terminals.body.rows).toEqual([]);
  });
});

describe("E-01 d27 — the pick is a write the hook copies into the next token (E-01-T13)", () => {
  it("E-01 d27 — an Owner picks a Store, and the refreshed token carries it", async () => {
    const pick = await rest("/rpc/session_select_store", owner.signedIn.access_token!, {
      method: "POST",
      schema: "app",
      body: {
        p_actor_user_id: org.people.owner!.id, p_actor_initials: null, p_terminal_id: null,
        p_request_id: randomUUID(), p_store_id: org.storeB,
      },
    });
    expect(pick.status, JSON.stringify(pick.body)).toBe(200);
    const r = await refresh(owner.signedIn.refresh_token!);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(claims(r.body.access_token as string).store_id).toBe(org.storeB);
  });
});

describe("A-110 — a System Administrator's passkey session", () => {
  it("A-110 — an active row yields principal=sysadmin, the sysadmin role, and null org_id, store_id and user_id", () => {
    expect(sysadmin.signedIn.error).toBeNull();
    const c = claims(sysadmin.signedIn.access_token!);
    expect(amr(sysadmin.signedIn.access_token!)).toContain("passkey");
    expect(ours(sysadmin.signedIn.access_token!)).toEqual({ principal: "sysadmin", org_id: null, store_id: null, user_id: null });
    expect(c.role).toBe("sysadmin");
  });

  it("A-90 — the sysadmin session reads the identity tables of every Organization through the API", async () => {
    const users = await rest("/users?select=id", sysadmin.signedIn.access_token!);
    expect(users.status, JSON.stringify(users.body)).toBe(200);
    expect((users.body.rows as unknown[]).length).toBeGreaterThanOrEqual(2);
    const pins = await rest("/user_pins?select=user_id", sysadmin.signedIn.access_token!);
    expect(pins.status).not.toBe(200);
  });
});

describe("A-122 — a passkey personal session ends at the next refresh once its holder is deactivated (finding 12)", () => {
  it("A-122 — active, the refresh is a personal session; deactivated, the next refresh is refused (E-01 d30)", async () => {
    const before = await refresh(latestManagerRefresh);
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    expect(amr(before.body.access_token as string)).toContain("passkey");
    expect(claims(before.body.access_token as string).principal).toBe("person");
    sql(`update public.users set active = false where id = '${org.people.manager!.id}'`);
    const after = await refresh(before.body.refresh_token as string);
    console.log(`A-122 passkey session after deactivation: status ${after.status} ${JSON.stringify(after.body)}`);
    expect(after.status).toBe(403);
    expect(after.body).toMatchObject({ msg: "role_refused" });
    expect(after.body.access_token).toBeUndefined();
  });
});
