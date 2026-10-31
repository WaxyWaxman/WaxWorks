// Fixture rows for tests/auth — the order's row 8 (fixtures only): these stand
// in for organization_create (S-01), store_create (O-01) and user_add (M-04),
// which other orders build. The Auth half is real: each person or store account
// is an Auth user created through the admin API and linked with
// app.auth_user_link under the secret key, as A-91's Server Action does.
import { randomUUID } from "node:crypto";
import { createAuthUser, deleteAuthUser, exec, local } from "./harness";

export interface Person {
  id: string;
  email: string;
  authId: string;
}

export interface Org {
  orgId: string;
  storeA: string;
  storeB: string;
  terminalA: string;
  storeAccount: { email: string; password: string; authId: string };
  people: Record<string, Person>;
  sysadmins: string[];
  cleanup(): Promise<void>;
}

const q = (v: string | null) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);

/** Links an Auth user to a row through the product's own write-back (A-114). */
async function link(kind: "user" | "store", rowId: string, authId: string): Promise<void> {
  const s = local();
  const res = await fetch(`${s.url}/rest/v1/rpc/auth_user_link`, {
    method: "POST",
    headers: {
      apikey: s.secretKey,
      Authorization: `Bearer ${s.secretKey}`,
      "Content-Type": "application/json",
      "Content-Profile": "app",
    },
    body: JSON.stringify({ p_kind: kind, p_row_id: rowId, p_auth_user_id: authId, p_request_id: randomUUID() }),
  });
  if (!res.ok) throw new Error(`auth_user_link ${kind}: ${res.status} ${await res.text()}`);
}

export interface PersonSpec {
  key: string;
  role: "employee" | "manager" | "owner";
  initials: string;
  stores: ("A" | "B")[];
  active?: boolean;
  selected?: "A" | "B" | null;
}

/** An Organization with Stores A and B, A's store account, and the people asked for. */
export async function makeOrg(run: string, specs: PersonSpec[], sysadmins: { active: boolean }[] = []): Promise<Org> {
  const orgId = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const terminalA = randomUUID();
  const storeEmail = `store-a-${run}@wx.test`;
  const storePassword = `store-pass-${run}-${randomUUID()}`;
  exec(`
    insert into public.organizations (id, name) values (${q(orgId)}, ${q(`Org ${run}`)});
    insert into public.stores (id, org_id, trading_name, store_account_email) values
      (${q(storeA)}, ${q(orgId)}, 'Store A', ${q(storeEmail)}),
      (${q(storeB)}, ${q(orgId)}, 'Store B', null);
    insert into public.terminals (id, org_id, store_id, name) values (${q(terminalA)}, ${q(orgId)}, ${q(storeA)}, 'Till 1');
  `);
  const storeAuth = await createAuthUser(storeEmail, storePassword);
  await link("store", storeA, storeAuth);

  const people: Record<string, Person> = {};
  for (const p of specs) {
    const id = randomUUID();
    const email = `${p.key}-${run}@wx.test`;
    const store = (x: "A" | "B") => (x === "A" ? storeA : storeB);
    exec(`
      insert into public.users (id, org_id, role, initials, display_name, email, active, selected_store_id) values
        (${q(id)}, ${q(orgId)}, ${q(p.role)}, ${q(p.initials)}, ${q(p.key)}, ${q(email)}, ${p.active === false ? "false" : "true"},
         ${p.selected ? q(store(p.selected)) : "null"});
      ${p.stores.map((x) => `insert into public.store_assignments (org_id, user_id, store_id) values (${q(orgId)}, ${q(id)}, ${q(store(x))});`).join("\n")}
    `);
    const authId = await createAuthUser(email);
    await link("user", id, authId);
    people[p.key] = { id, email, authId };
  }

  const admins: string[] = [];
  for (const [i, a] of sysadmins.entries()) {
    const email = `sysadmin-${i}-${run}@wx.test`;
    const authId = await createAuthUser(email);
    exec(`insert into public.system_administrators (auth_user_id, name, active, deactivated_at)
         values (${q(authId)}, ${q(email)}, ${a.active}, ${a.active ? "null" : "now()"});`);
    admins.push(authId);
  }

  return {
    orgId, storeA, storeB, terminalA,
    storeAccount: { email: storeEmail, password: storePassword, authId: storeAuth },
    people,
    sysadmins: admins,
    async cleanup() {
      exec(`
        delete from public.review_flags where org_id = ${q(orgId)};
        delete from public.pin_refusals where org_id = ${q(orgId)};
        delete from public.pin_line_closures where org_id = ${q(orgId)};
        delete from public.terminals where org_id = ${q(orgId)};
        delete from public.user_pins where org_id = ${q(orgId)};
        delete from public.store_assignments where org_id = ${q(orgId)};
        update public.users set selected_store_id = null where org_id = ${q(orgId)};
        delete from public.users where org_id = ${q(orgId)};
        delete from public.stores where org_id = ${q(orgId)};
        delete from public.organizations where id = ${q(orgId)};
        ${admins.length ? `delete from public.system_administrators where auth_user_id in (${admins.map(q).join(", ")});` : ""}
      `);
      for (const id of [storeAuth, ...Object.values(people).map((p) => p.authId), ...admins]) await deleteAuthUser(id);
    },
  };
}
