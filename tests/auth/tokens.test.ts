// Token claims from local Supabase Auth through the access-token hook — no
// browser (A-126). The passkey rows are passkey.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authCall, claims, exec, linkSession, passwordSignIn, refresh, rest, runId } from "./harness";
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
    const principal = r.status === 200 ? claims(r.body.access_token as string).principal : "refused";
    console.log(`A-110 inactive sysadmin: status ${r.status} ${r.status === 200 ? `principal=${String(principal)}` : JSON.stringify(r.body)}`);
    expect(principal).not.toBe("sysadmin");
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
