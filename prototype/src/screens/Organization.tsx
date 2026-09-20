import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ManagerAuthorize } from "../components/ManagerAuthorize";
import { SpecNote } from "../components/SpecNote";
import type { ManagerAuth } from "../lib/managerAuth";
import { requireOwner } from "../lib/managerAuth";
import { useApp } from "../store/AppStore";

// O-01 — the Organization as a thing an Owner holds: its Stores, their store
// accounts, its Owners and Managers.
//
// OWNER-ONLY IN ITS ENTIRETY (d1). The screen is reached like any
// manager-locked area — by PIN on a store session, by the session itself on a
// personal one (E-01 d26, d27) — and then asks a second question the other
// areas do not: is this an Owner? A Manager who crosses sees the refusal BY
// NAME, because here the person is known and no secret is at stake; the
// write path refuses a Manager's call regardless of what any screen offered.
//
// NOTHING HERE IS A FIGURE (d4). Stores with their identifiers and store
// account emails; Owners and Managers with their Stores; the logs of this
// flow's own acts. No inventory, no Sale, no balance of any Store — A-72
// deferred consolidation and E-01 d27 has an Owner work one Store at a time;
// the screen that administers every Store must not become the screen that
// reports on every Store by accident.
export function Organization() {
  const app = useApp();
  const nav = useNavigate();
  const [authorisedBy, setAuthorisedBy] = useState<ManagerAuth | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  if (!authorisedBy)
    return (
      <ManagerAuthorize
        title="Organization — Owner only"
        reason="Creating Stores, holding their store accounts, and administering Managers and Owners is Owner-only (O-01 d1, M-04 d30). A Manager who crosses this line is refused by name."
        onConfirm={(by) => setAuthorisedBy(by)}
        onCancel={() => nav(-1)}
      />
    );

  // The second question (d1). Re-asked on every render so a demotion between
  // the prompt and the act bites here as it does in the write path.
  const owner = requireOwner(app.users, authorisedBy);
  if (!owner.ok)
    return (
      <div className="page">
        <div className="callout danger">{owner.refusal}</div>
        <p className="muted small">
          This screen is Owner-only in its entirety (O-01 d1). Ask an Owner, or have one make you one
          (M-04 d30).
        </p>
        <button className="btn ghost" onClick={() => nav(-1)}>
          Back
        </button>
      </div>
    );

  const org = app.organizations[0];
  const owners = app.users.filter((u) => u.role === "Owner");
  const managers = app.users.filter((u) => u.role === "Manager");

  return (
    <div className="page org">
      <div className="cust-head">
        <h2>
          {org.name} <span className="badge">Organization</span>
        </h2>
        <span className="small muted">Authorised by {authorisedBy.name}</span>
      </div>
      <p className="muted small" style={{ maxWidth: "var(--measure)" }}>
        Identity and configuration only — no figure of any Store appears here (O-01 d4). An Owner works
        one Store at a time on a personal session and administers all of them from this screen.
      </p>
      {refusal && <div className="callout danger">{refusal}</div>}

      <section className="org-section">
        <h3>
          Stores{" "}
          <SpecNote cite="M-06 d47, d70 / O-01 d2, d3">
            An Owner creates a Store; the system mints its seven-digit Store ID and position, neither ever
            editable. A new Store starts from M-06's defaults with nobody assigned — staff it in Users. The
            store account's password is the one credential an administrator types (it is a Store's, not a
            person's); rotating it signs every terminal of the Store out at once (E-01 d24).
          </SpecNote>
        </h3>
        <table className="org-table">
          <thead>
            <tr>
              <th>Store ID</th>
              <th>Pos.</th>
              <th>Trading name</th>
              <th>Store account</th>
              <th>Assigned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...app.stores]
              .sort((a, b) => a.position - b.position)
              .map((s) => (
                <StoreRow key={s.id} storeId={s.id} by={authorisedBy} onRefusal={setRefusal} />
              ))}
          </tbody>
        </table>
        <NewStore by={authorisedBy} onRefusal={setRefusal} />
      </section>

      <section className="org-section">
        <h3>
          Owners and Managers{" "}
          <SpecNote cite="M-04 d25, d26, d30">
            Owner ⊃ Manager ⊃ Employee. Creating, re-roling, deactivating or reassigning a Manager or Owner is
            Owner-only; an Organization always keeps at least one active Owner. Administered in Users.
          </SpecNote>
        </h3>
        <ul className="org-people">
          {[...owners, ...managers].map((u) => (
            <li key={u.id}>
              <Link to={`/users/${u.id}`}>{u.name}</Link>{" "}
              <span className="muted small">
                {u.role}
                {u.active ? "" : " · deactivated"} ·{" "}
                {u.assignments.length ? u.assignments.map((id) => app.storeDetailsFor(id).tradingName).join(", ") : "no Store"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="org-section">
        <h3>Organization log</h3>
        <ul className="loglist">
          {[...org.log].reverse().map((l, i) => (
            <li key={i}>
              <span className="small muted">{l.at.replace("T", " ")}</span>
              <div>{l.text}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StoreRow({ storeId, by, onRefusal }: { storeId: string; by: ManagerAuth; onRefusal: (r: string | null) => void }) {
  const app = useApp();
  const s = app.stores.find((x) => x.id === storeId)!;
  const details = app.storeDetailsFor(storeId);
  const assigned = app.users.filter((u) => u.active && u.assignments.includes(storeId)).length;
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const inSession = app.currentStoreId === storeId;

  return (
    <>
      <tr>
        <td>
          <code>{s.id}</code>
        </td>
        <td>{s.position}</td>
        <td>
          {details.tradingName}
          {inSession && <span className="muted small"> · in session</span>}
        </td>
        <td>
          <code>{s.accountEmail}</code>
        </td>
        <td>{assigned}</td>
        <td>
          <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Reset store account"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6}>
            <div className="callout small">
              <strong>Rotate the store account password.</strong> Every terminal of {details.tradingName} is
              signed out at once (E-01 d24, O-01 d3)
              {app.principal?.kind === "store" && app.principal.storeId === storeId ? " — including this one." : "."}{" "}
              Logged as changed, never as a value.
              <div className="btn-row" style={{ marginTop: 6 }}>
                <input type="password" placeholder="new password (8+)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                <button
                  className="btn danger sm"
                  onClick={() => {
                    const r = app.setStoreAccountPassword(storeId, pw, by);
                    if (r.ok) {
                      setPw("");
                      setOpen(false);
                      onRefusal(null);
                    } else onRefusal(r.reason);
                  }}
                >
                  Rotate and sign out every terminal
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {s.log.length > 0 && (
        <tr className="org-log-row">
          <td colSpan={6}>
            <span className="small muted">{s.log[s.log.length - 1].at.replace("T", " ")} — {s.log[s.log.length - 1].text}</span>
          </td>
        </tr>
      )}
    </>
  );
}

function NewStore({ by, onRefusal }: { by: ManagerAuth; onRefusal: (r: string | null) => void }) {
  const app = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [tradingName, setTradingName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  if (!open)
    return (
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={() => setOpen(true)}>
          ＋ New Store
        </button>
      </div>
    );

  return (
    <div className="callout" style={{ marginTop: 8 }}>
      <strong>New Store</strong>
      <div className="stack" style={{ marginTop: 8 }}>
        <label className="field">
          <span>Trading name</span>
          <input autoFocus value={tradingName} placeholder="e.g. Wax Works — Mile End" onChange={(e) => setTradingName(e.target.value)} />
        </label>
        <label className="field">
          <span>Store account email</span>
          <input value={email} placeholder="the address a terminal signs in with" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Store account password</span>
          <input type="password" value={pw} placeholder="8+ characters" onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <p className="small muted">
          Store ID and position are assigned on creation and never editable (M-06 d47, d70). Settings start
          from M-06's defaults; nobody is assigned until you assign them in Users (O-01 d2).
        </p>
        <div className="btn-row">
          <button
            className="btn primary"
            onClick={() => {
              const r = app.addStore({ tradingName, accountEmail: email, accountPassword: pw }, by);
              if (r.ok) {
                onRefusal(null);
                setOpen(false);
                setTradingName("");
                setEmail("");
                setPw("");
                nav("/organization");
              } else onRefusal(r.reason);
            }}
          >
            Create Store
          </button>
          <button className="btn ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
