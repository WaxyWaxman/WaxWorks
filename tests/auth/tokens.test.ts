// Token claims from local Supabase Auth through the access-token hook — no
// browser (A-126). The passkey rows are passkey.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { authCall, claims, createAuthUser, deleteAuthUser, exec, linkSession, passwordSignIn, refresh, rest, runId, sql } from "./harness";
import { makeOrg, type Org } from "./fixtures";

const amr = (jwt: string) => ((claims(jwt).amr as { method: string }[] | undefined) ?? []).map((a) => a.method);
const ours = (jwt: string) => {
  const c = claims(jwt);
  return { principal: c.principal ?? null, org_id: c.org_id ?? null, store_id: c.store_id ?? null, user_id: c.user_id ?? null };
};

let org: Org;

beforeAll(async () => {
  org = await makeOrg(runId(), [
    { key: "manager", role: "manager", initials: "MM", stores: ["A"], selected: "A" },
    { key: "employee", role: "employee", initials: "EE", stores: ["A"] },
    { key: "departed", role: "manager", initials: "DD", stores: ["A"], active: false },
    { key: "demoted", role: "manager", initials: "XX", stores: ["A"], selected: "A" },
    { key: "unsent", role: "manager", initials: "UN", stores: ["A"], selected: "A", enrolment: false },
    { key: "holder", role: "manager", initials: "HH", stores: ["A"], selected: "A", pin: "4321" },
  ], [{ active: true }, { active: false }]);
});

afterAll(async () => {
  await org?.cleanup();
});

describe("E-01 d24 — a terminal opens a store session with the Store's store account (A-87, E-01-T9)", () => {
  it("E-01 d24 — the password token carries principal=store, its Organization and its Store, and no user", async () => {
    const r = await passwordSignIn(org.storeAccount.email, org.storeAccount.password);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(ours(r.body.access_token as string)).toEqual({ principal: "store", org_id: org.orgId, store_id: org.storeA, user_id: null });
  });

  it("E-01 d34 — the store account has no second factor: a password token is a store session, never an enrolment session", async () => {
    const r = await passwordSignIn(org.storeAccount.email, org.storeAccount.password);
    expect(amr(r.body.access_token as string)).toEqual(["password"]);
    expect(claims(r.body.access_token as string).principal).toBe("store");
    const again = await refresh(r.body.refresh_token as string);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(ours(again.body.access_token as string)).toEqual({ principal: "store", org_id: org.orgId, store_id: org.storeA, user_id: null });
  });
});

describe("A-91, amended 2026-10-31 — the email provider is on for sign-in, and public sign-up stays off", () => {
  it("A-91 — a public sign-up through /auth/v1/signup is refused, proven against the running Auth", async () => {
    const r = await authCall("/signup", { body: { email: `signup-${runId()}@wx.test`, password: `pw-${runId()}-${runId()}` } });
    console.log(`A-91 public sign-up: status ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.access_token).toBeUndefined();
    expect(r.body.id).toBeUndefined();
  });
});

describe("A-117 — a link's session is an enrolment session that reaches nothing (E-01 d37, E-01-T23)", () => {
  let token = "";

  beforeAll(async () => {
    const r = await linkSession(org.people.manager!.email);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    token = r.body.access_token as string;
  });

  it("A-117 — the OTP token gets principal=enrolment with the person's user_id and null org_id and store_id", () => {
    expect(amr(token)).not.toContain("passkey");
    expect(ours(token)).toEqual({ principal: "enrolment", org_id: null, store_id: null, user_id: org.people.manager!.id });
  });

  it("E-01 d33 — a person's OTP-only token is never principal=person", () => {
    expect(claims(token).principal).not.toBe("person");
  });

  it("E-01 d37 — the enrolment session reads no row", async () => {
    for (const table of ["users", "organizations", "stores", "terminals", "store_assignments"]) {
      const r = await rest(`/${table}?select=*`, token);
      expect(r.status, `${table}: ${JSON.stringify(r.body)}`).toBe(200);
      expect(r.body.rows, table).toEqual([]);
    }
  });

  it("E-01 d37 — the enrolment session reaches no function: refused no_tenant", async () => {
    const r = await rest("/rpc/actor_resolve", token, {
      method: "POST",
      schema: "app",
      body: { p_initials: "MM", p_terminal_id: org.terminalA, p_request_id: "00000000-0000-4000-8000-000000000002" },
    });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "28000", message: "no_tenant" });
  });
});

describe("A-110 — a System Administrator is an active system_administrators row", () => {
  it("A-117 — an active System Administrator's link session without a passkey is an enrolment session, not sysadmin", async () => {
    const email = await adminEmail(org.sysadmins[0]!);
    const r = await linkSession(email);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(ours(r.body.access_token as string).principal).toBe("enrolment");
    expect(claims(r.body.access_token as string).role).toBe("authenticated");
  });

  it("A-110 — an inactive row is refused exactly as no row is: no sysadmin token", async () => {
    const email = await adminEmail(org.sysadmins[1]!);
    const r = await linkSession(email);
    console.log(`A-110 inactive sysadmin: status ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ msg: "no_principal" });
    expect(r.body.access_token).toBeUndefined();
  });

  it("A-125 — an Auth user matching no row is refused no_principal (A-125, clarified 2026-10-31)", async () => {
    const email = `nobody-${runId()}@wx.test`;
    const id = await createAuthUser(email);
    try {
      const r = await linkSession(email);
      console.log(`A-125 unmatched Auth user: status ${r.status} ${JSON.stringify(r.body)}`);
      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ msg: "no_principal" });
    } finally {
      await deleteAuthUser(id);
    }
  });
});

describe("A-130 — a store session comes only from a password sign-in", () => {
  it("A-130 — the store account signed in by a link gets no token (E-01 d34: the Owner's reset is the kill switch)", async () => {
    const r = await linkSession(org.storeAccount.email);
    console.log(`A-130 store account by link: status ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ msg: "no_principal" });
    expect(r.body.access_token).toBeUndefined();
  });
});

describe("A-131 — an enrolment session only while an issued link is outstanding", () => {
  it("A-131 — a Manager with no window open gets no session from a link (M-04 d38: re-enrolled through an Owner)", async () => {
    const r = await linkSession(org.people.unsent!.email);
    console.log(`A-131 self-service link: status ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ msg: "no_principal" });
  });
});

describe("A-129, A-119 — the PIN pad over HTTP", () => {
  let store = "";

  beforeAll(async () => {
    const r = await passwordSignIn(org.storeAccount.email, org.storeAccount.password);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    store = r.body.access_token as string;
  });

  const pinBody = (pin: string) => ({
    p_pin: pin, p_terminal_id: org.terminalA, p_request_id: randomUUID(), p_actor_user_id: null, p_actor_initials: null,
  });

  it("A-129 — a GET of manager_authorize_pin is refused read_only and names nobody, a correct PIN included (finding 1)", async () => {
    const params = (pin: string) =>
      `p_pin=${pin}&p_terminal_id=${org.terminalA}&p_request_id=${randomUUID()}`;
    const right = await rest(`/rpc/manager_authorize_pin?${params("4321")}`, store, { schema: "app" });
    const wrong = await rest(`/rpc/manager_authorize_pin?${params("9999")}`, store, { schema: "app" });
    console.log(`A-129 GET correct PIN: status ${right.status} ${JSON.stringify(right.body)}`);
    console.log(`A-129 GET wrong PIN: status ${wrong.status} ${JSON.stringify(wrong.body)}`);
    for (const r of [right, wrong]) {
      expect(r.body).toMatchObject({ code: "25006", message: "read_only" });
      expect(JSON.stringify(r.body)).not.toContain(org.people.holder!.id);
    }
    const written = sql<{ n: number }>(`select count(*)::int as n from public.pin_refusals where org_id = '${org.orgId}'`);
    expect(written[0]?.n).toBe(0);
  });

  it("A-119 — refusals return 403 then 400, and PostgREST commits each record, the closure and its flag (E-01 d31, finding 13)", async () => {
    const seen: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const r = await rest("/rpc/manager_authorize_pin", store, { method: "POST", schema: "app", body: pinBody(`90${i}0`) });
      seen.push(`call ${i}: ${r.status} ${String(r.body.message)}`);
      expect(r.status).toBe(i <= 5 ? 403 : 400);
      expect(r.body.message).toBe(i <= 5 ? "pin_refused" : "pin_line_closed");
    }
    console.log(`A-119 over HTTP:\n${seen.join("\n")}`);
    const rows = sql<{ refusals: number; closures: number; flags: number }>(`
      select (select count(*)::int from public.pin_refusals where org_id = '${org.orgId}') as refusals,
             (select count(*)::int from public.pin_line_closures where org_id = '${org.orgId}') as closures,
             (select count(*)::int from public.review_flags where org_id = '${org.orgId}') as flags`);
    console.log(`A-119 committed: ${JSON.stringify(rows[0])}`);
    expect(rows[0]).toEqual({ refusals: 6, closures: 1, flags: 1 });
  });
});

describe("A-122 — a personal session belongs only to an active Manager or Owner", () => {
  it("A-122 — the hook issues an Employee no token, not even an enrolment session", async () => {
    const r = await linkSession(org.people.employee!.email);
    console.log(`A-122 Employee link: status ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.access_token).toBeUndefined();
  });

  it("A-122 — the hook issues an inactive person no token", async () => {
    const r = await linkSession(org.people.departed!.email);
    console.log(`A-122 inactive person link: status ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.access_token).toBeUndefined();
  });

  it("A-122 — demoted to Employee, the next refresh is refused (M-04 d45)", async () => {
    const r = await linkSession(org.people.demoted!.email);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    exec(`update public.users set role = 'employee' where id = '${org.people.demoted!.id}';`);
    const next = await refresh(r.body.refresh_token as string);
    console.log(`A-122 refresh after demotion: status ${next.status} ${JSON.stringify(next.body)}`);
    expect(next.status).toBeGreaterThanOrEqual(400);
    expect(next.body.access_token).toBeUndefined();
  });
});

describe("A-122 (3) — can Supabase Auth sign a user out by id? Observed, whichever way it falls", () => {
  it("A-122 — the admin API is asked to end a user's sessions by id, and its answers are recorded", async () => {
    const r = await linkSession(org.people.manager!.email);
    expect(r.status).toBe(200);
    const id = org.people.manager!.authId;
    const tries: [string, string][] = [
      ["POST", `/admin/users/${id}/logout`],
      ["DELETE", `/admin/users/${id}/sessions`],
      ["POST", `/admin/users/${id}/sessions/revoke`],
      ["POST", `/admin/logout?user_id=${id}`],
    ];
    const seen: string[] = [];
    for (const [method, path] of tries) {
      const a = await authCall(path, { method, key: "secret", body: method === "POST" ? {} : undefined });
      seen.push(`${method} ${path.replace(id, "{id}")} -> ${a.status} ${JSON.stringify(a.body)}`);
    }
    const after = await refresh(r.body.refresh_token as string);
    seen.push(`refresh of the person's session afterwards -> ${after.status}`);
    console.log(`A-122 revoke-by-id observation:\n${seen.join("\n")}`);
    // An observation, not a gate: it passes whichever way Auth answers, and the
    // order's Evidence quotes what it printed.
    expect(seen).toHaveLength(tries.length + 1);
  });
});

async function adminEmail(authId: string): Promise<string> {
  const r = await authCall(`/admin/users/${authId}`, { method: "GET", key: "secret" });
  return r.body.email as string;
}
