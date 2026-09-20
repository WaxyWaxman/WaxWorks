import { useMemo, useState } from "react";
import { SpecNote } from "../components/SpecNote";
import { useApp } from "../store/AppStore";

// S-01 — the whole of what a System Administrator can do in the product.
//
// IDENTITY DATA ONLY (d1, A-90): Organizations; Stores' identity — trading
// name, Store ID, position, store account email, active; people — name,
// email, role, active, assignments; and the change logs. Nothing a Store
// sells, holds or owes is REACHABLE from here: this shell has no route to any
// Store screen, and the Gate never mounts one for this principal. In the
// product the boundary is the read path's — a Postgres role holding SELECT on
// exactly these relations — and this in-memory prototype can only demonstrate
// the screen's scope, which `docs/prototype.md` says plainly.
//
// THREE FUNCTIONS (d2, d3): create an Organization with its first Owner;
// trigger an Owner's reset; recover an Organization that has no active Owner
// left — refused while one exists. Each logs into the Organization it
// touched, where its Owners read what was done from outside (O-01 d5).
//
// NO IMPERSONATION (d1). There is no "view as"; a support case that needs a
// Store's data is an Owner showing it.

type Tab = "orgs" | "stores" | "people" | "log";

export function Sysadmin() {
  const app = useApp();
  const me = app.sysadmins.find((x) => x.id === (app.principal?.kind === "sysadmin" ? app.principal.sysadminId : ""));
  const [tab, setTab] = useState<Tab>("orgs");
  const [refusal, setRefusal] = useState<string | null>(null);

  const run = (r: { ok: true } | { ok: true; id: string } | { ok: false; reason: string }) => {
    setRefusal(r.ok ? null : r.reason);
    return r.ok;
  };

  return (
    <div className="admin">
      <header className="topbar admin-bar">
        <span className="brand">
          <span className="dot" /> Wax Works · administration
        </span>
        <nav>
          {(
            [
              ["orgs", "Organizations"],
              ["stores", "Stores"],
              ["people", "People"],
              ["log", "Change log"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} className={"admin-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="who">
          <span className="muted small">{me?.name ?? "System Administrator"} · System Administrator</span>{" "}
          <button className="btn ghost sm" onClick={() => app.signOut()}>
            Sign out
          </button>
        </span>
      </header>
      <main className="page">
        <div className="callout small">
          <strong>Identity data only (S-01 d1, A-90).</strong> Organizations, Stores' identity, people and the
          change log. Nothing a Store sells, holds or owes is reachable from here, and there is no <em>view as</em>.
          Prototype: the boundary is the screen's; the product's is a Postgres role's.
        </div>
        {refusal && <div className="callout danger">{refusal}</div>}
        {tab === "orgs" && <Organizations run={run} />}
        {tab === "stores" && <Stores />}
        {tab === "people" && <People run={run} />}
        {tab === "log" && <ChangeLog />}
      </main>
    </div>
  );
}

function Organizations({ run }: { run: (r: { ok: true; id: string } | { ok: true } | { ok: false; reason: string }) => boolean }) {
  const app = useApp();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerInitials, setOwnerInitials] = useState("");

  return (
    <section className="org-section">
      <h3>
        Organizations{" "}
        <SpecNote cite="S-01 d2, d3">
          Onboarding is a System Administrator's act: an Organization is created with a name and its first
          Owner, who is invited by email and has no Store yet — they create the first one (O-01 d2). No
          public sign-up. Recovery restores an Owner to an Organization that has none left, and is refused
          while one exists.
        </SpecNote>
      </h3>
      <table className="org-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Stores</th>
            <th>Owners</th>
            <th>Managers</th>
            <th>Recovery</th>
          </tr>
        </thead>
        <tbody>
          {app.organizations.map((o) => {
            const people = app.users.filter((u) => u.orgId === o.id);
            const owners = people.filter((u) => u.role === "Owner");
            const activeOwners = owners.filter((u) => u.active);
            return (
              <OrgRow
                key={o.id}
                name={o.name}
                stores={app.stores.filter((s) => s.orgId === o.id).length}
                owners={owners.length}
                activeOwners={activeOwners.length}
                managers={people.filter((u) => u.role === "Manager" && u.active).length}
                orgId={o.id}
                deactivatedOwners={owners.filter((u) => !u.active).map((u) => ({ id: u.id, name: u.name }))}
                run={run}
              />
            );
          })}
        </tbody>
      </table>

      <div className="callout" style={{ marginTop: 12 }}>
        <strong>Create an Organization</strong>
        <div className="stack" style={{ marginTop: 8 }}>
          <label className="field">
            <span>Organization name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sonic Boom Records Ltd." />
          </label>
          <div className="btn-row">
            <label className="field" style={{ flex: 2 }}>
              <span>First Owner — name</span>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Initials</span>
              <input value={ownerInitials} maxLength={4} onChange={(e) => setOwnerInitials(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 2 }}>
              <span>Email (the invite goes here)</span>
              <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </label>
          </div>
          <div className="btn-row">
            <button
              className="btn primary"
              onClick={() => {
                if (run(app.createOrganization({ name, ownerName, ownerEmail, ownerInitials }))) {
                  setName("");
                  setOwnerName("");
                  setOwnerEmail("");
                  setOwnerInitials("");
                }
              }}
            >
              Create and invite the Owner
            </button>
            <span className="small muted">No Store is created here — the Owner creates the first one (O-01 d2).</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function OrgRow({
  name,
  stores,
  owners,
  activeOwners,
  managers,
  orgId,
  deactivatedOwners,
  run,
}: {
  name: string;
  stores: number;
  owners: number;
  activeOwners: number;
  managers: number;
  orgId: string;
  deactivatedOwners: { id: string; name: string }[];
  run: (r: { ok: true } | { ok: false; reason: string }) => boolean;
}) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState({ name: "", email: "", initials: "" });
  return (
    <>
      <tr>
        <td>{name}</td>
        <td>{stores}</td>
        <td>
          {activeOwners} active{owners !== activeOwners ? ` (${owners - activeOwners} deactivated)` : ""}
          {activeOwners === 0 && <span className="badge off" style={{ marginLeft: 6 }}>no Owner</span>}
        </td>
        <td>{managers}</td>
        <td>
          <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Recover…"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <div className="callout small">
              <strong>Recover access</strong> — restore an Owner, never act as one (S-01 d3). Refused while the
              Organization has an active Owner (A-90). Logged where its Owners read it.
              <div className="btn-row" style={{ marginTop: 6 }}>
                {deactivatedOwners.map((o) => (
                  <button key={o.id} className="btn sm" onClick={() => run(app.sysadminRecoverOwner(orgId, { reactivate: o.id })) && setOpen(false)}>
                    Reactivate {o.name}
                  </button>
                ))}
              </div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <input placeholder="new Owner — name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
                <input placeholder="initials" maxLength={4} style={{ width: 80 }} value={inv.initials} onChange={(e) => setInv({ ...inv, initials: e.target.value })} />
                <input placeholder="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
                <button className="btn sm primary" onClick={() => run(app.sysadminRecoverOwner(orgId, { invite: inv })) && setOpen(false)}>
                  Invite a new Owner
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Stores() {
  const app = useApp();
  return (
    <section className="org-section">
      <h3>
        Stores — identity only{" "}
        <SpecNote cite="S-01 d1, A-90">
          Trading name, Store ID, position, store account email, active: the <code>stores_identity</code> view.
          Never the store account password, never a setting, never anything the Store holds.
        </SpecNote>
      </h3>
      <table className="org-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Store ID</th>
            <th>Pos.</th>
            <th>Trading name</th>
            <th>Store account</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {app.stores.map((s) => (
            <tr key={s.id}>
              <td>{app.organizations.find((o) => o.id === s.orgId)?.name}</td>
              <td>
                <code>{s.id}</code>
              </td>
              <td>{s.position}</td>
              <td>{app.storeDetailsFor(s.id).tradingName}</td>
              <td>
                <code>{s.accountEmail}</code>
              </td>
              <td>{s.active ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function People({ run }: { run: (r: { ok: true } | { ok: false; reason: string }) => boolean }) {
  const app = useApp();
  return (
    <section className="org-section">
      <h3>
        People{" "}
        <SpecNote cite="S-01 d1, d3">
          Name, email, role, active and Store assignments — no PIN, no password, nothing they did. A System
          Administrator may trigger an <strong>Owner's</strong> reset link; an Owner resets everyone else's
          (M-04 d29).
        </SpecNote>
      </h3>
      <table className="org-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>Stores</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {app.users.map((u) => (
            <tr key={u.id}>
              <td>{app.organizations.find((o) => o.id === u.orgId)?.name}</td>
              <td>{u.name}</td>
              <td>{u.role}</td>
              <td>{u.email ?? <span className="muted">—</span>}</td>
              <td>{u.assignments.join(", ") || <span className="muted">none</span>}</td>
              <td>{u.active ? "yes" : "no"}</td>
              <td>
                {u.role === "Owner" && u.active && (
                  <button className="btn ghost sm" onClick={() => run(app.sysadminRequestOwnerReset(u.id))}>
                    Send reset link
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ChangeLog() {
  const app = useApp();
  const rows = useMemo(() => {
    const out: { at: string; where: string; text: string }[] = [];
    for (const o of app.organizations) for (const l of o.log) out.push({ at: l.at, where: `Organization · ${o.name}`, text: l.text });
    for (const s of app.stores) for (const l of s.log) out.push({ at: l.at, where: `Store · ${s.id}`, text: l.text });
    for (const u of app.users) for (const l of u.log) out.push({ at: l.at, where: `User · ${u.name}`, text: l.text });
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [app.organizations, app.stores, app.users]);
  return (
    <section className="org-section">
      <h3>
        Change log{" "}
        <SpecNote cite="S-01 d1, O-01 d5">
          <code>organizations.log</code>, <code>stores.log</code> and <code>users.log</code> — who changed what, and
          every System Administrator's act among them. Credentials appear as changed, never as a value.
        </SpecNote>
      </h3>
      <ul className="loglist">
        {rows.map((r, i) => (
          <li key={i}>
            <span className="small muted">
              {r.at.replace("T", " ")} · {r.where}
            </span>
            <div>{r.text}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
