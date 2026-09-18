import { useMemo, useState } from "react";
import type { ManagerAuth } from "../lib/managerAuth";
import { useNavigate, useParams } from "react-router-dom";
import { SpecNote } from "../components/SpecNote";
import type { User, UserRole } from "../data/types";
import { readStored, writeStored } from "../lib/tillMemory";
import { useApp, type UserWriteResult } from "../store/AppStore";
import { ManagerAuthorize } from "../components/ManagerAuthorize";

// M-04 Users, on the till's three tracks like every other back-office screen:
// the slab you look in, the person you opened, and their log.
//
// Two things about this screen are not cosmetic.
//
// FIRST, nothing here is enforced by disabling a button. Architecture A-55
// puts both invariants in the write path — a partial unique index on active
// initials, and the last-Manager floor as an assertion under a lock — so every
// action calls the store and renders whatever reason comes back. A disabled
// control is a hint; the refusal is the rule. The Demote and Deactivate
// buttons on the last active Manager are therefore LIVE, and pressing one
// tells you why it will not happen. That is deliberate: a greyed-out button
// with no explanation is the thing A-54 warns reads as the system simply
// saying no.
//
// SECOND, every row shows a NAME, not initials alone. M-04 d16 releases a
// deactivated user's initials to a new hire, so the letters stop identifying a
// person — the seed carries T. Oyelaran (gone) and T. Okonkwo (current) both
// as TO to make that visible rather than theoretical. The initials tile is
// there because it is what people type; the name beside it is what makes the
// record readable.

const SLAB_KEY = "waxworks.users.slab";

type Filter = "active" | "managers" | "inactive" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "managers", label: "Managers" },
  { key: "inactive", label: "Deactivated" },
  { key: "all", label: "Everyone" },
];

export function Users() {
  const app = useApp();
  const nav = useNavigate();
  const { userId } = useParams();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [draft, setDraft] = useState<{ name: string; initials: string; role: UserRole } | null>(null);
  // One refusal at a time, shown where the action was taken. Cleared by the
  // next action rather than by a timer, so it cannot vanish while being read.
  const [refusal, setRefusal] = useState<string | null>(null);
  // M-04 d11 and architecture A-55 make ALL user administration manager-only,
  // and the screen was enforcing none of it — anyone could open /users and
  // clear a Manager's password. A-28a's mechanism is an in-place
  // authorisation, so the whole screen is gated once on arrival and the
  // authorising Manager's name is what lands in every log row from then on,
  // rather than a hardcoded constant.
  //
  // Gated as a WHOLE rather than per action, following M-05's "manager-only
  // in its entirety": administering users is a sitting-down job, and a prompt
  // per row is d12's trains-you-not-to-read problem again.
  const [authorisedBy, setAuthorisedBy] = useState<ManagerAuth | null>(null);

  const setSlab = (v: boolean) => {
    setSlabOpen(v);
    writeStored(SLAB_KEY, v);
  };

  const managers = app.activeManagerCount();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return app.users
      .filter((u) => {
        if (filter === "active" && !u.active) return false;
        if (filter === "inactive" && u.active) return false;
        if (filter === "managers" && !(u.active && u.role === "Manager")) return false;
        if (!q) return true;
        return u.name.toLowerCase().includes(q) || u.initials.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }, [app.users, query, filter]);

  const counts = useMemo(
    () => ({
      active: app.users.filter((u) => u.active).length,
      managers,
      inactive: app.users.filter((u) => !u.active).length,
      all: app.users.length,
    }),
    [app.users, managers],
  );

  const selectedId = userId ?? rows[0]?.id ?? app.users[0]?.id ?? null;
  const selected = app.users.find((u) => u.id === selectedId) ?? null;

  const select = (id: string) => {
    setRefusal(null);
    setDraft(null);
    nav(`/users/${id}`);
  };

  // Every write funnels through here so a refusal is surfaced the same way
  // whichever action produced it.
  const run = (r: UserWriteResult) => {
    if (r.ok) {
      setRefusal(null);
      return true;
    }
    setRefusal(r.reason);
    return false;
  };

  const addDraft = () => {
    if (!draft) return;
    // Manager-only (A-28a). Refuse rather than coerce: this read
    // `authorisedBy ?? ""`, which handed a gated write an empty
    // authorizer whenever none was present.
    if (!authorisedBy) return;
    const r = app.addUser(draft, authorisedBy);
    if (run(r) && r.ok) {
      setDraft(null);
      setQuery("");
      nav(`/users/${r.id}`);
    }
  };

  if (!authorisedBy)
    return (
      <ManagerAuthorize
        title="Users — manager only"
        reason="Adding, re-roling, deactivating and setting a password are manager-only (M-04 d11, architecture A-55). A Manager authorises in place; their name is recorded against everything done here."
        onConfirm={(by) => setAuthorisedBy(by)}
        onCancel={() => nav(-1)}
      />
    );

  return (
    <div className={"cust-frame" + (slabOpen ? "" : " slab-shut")}>
      <aside className={"sup-slab" + (slabOpen ? "" : " shut")}>
        {slabOpen ? (
          <>
            <div className="slab-head">
              <span className="lab">Users</span>
              <button className="btn ghost sm" onClick={() => setSlab(false)} title="Collapse">
                ‹
              </button>
            </div>
            <div className="slab-search">
              <input
                type="search"
                value={query}
                placeholder="Name or initials"
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="btn primary"
                onClick={() => {
                  setRefusal(null);
                  setDraft({ name: "", initials: "", role: "Employee" });
                }}
              >
                ＋ New
              </button>
            </div>
            <div className="slab-chips">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={"filter-chip" + (filter === f.key ? " on" : "")}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label} <span className="n">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            <div className="slab-list">
              {rows.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={"hit" + (u.id === selectedId ? " on" : "") + (u.active ? "" : " user-off")}
                  onClick={() => select(u.id)}
                >
                  <span className="ini">{u.initials}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="t" style={{ display: "block" }}>
                      {u.name}
                    </span>
                    <span className="m" style={{ display: "block" }}>
                      {u.role}
                      {u.active ? "" : " · deactivated"}
                    </span>
                  </span>
                </button>
              ))}
              {!rows.length && <div className="users-empty small muted">Nobody matches.</div>}
            </div>
          </>
        ) : (
          <button className="slab-strip" onClick={() => setSlab(true)} title="Users">
            <span className="strip-ini">👥</span>
          </button>
        )}
      </aside>

      {draft ? (
        <NewUserCard
          draft={draft}
          managers={managers}
          refusal={refusal}
          by={authorisedBy}
          onChange={(p) => setDraft((d) => (d ? { ...d, ...p } : d))}
          onCancel={() => {
            setDraft(null);
            setRefusal(null);
          }}
          onAdd={addDraft}
        />
      ) : selected ? (
        <UserCard
          key={selected.id}
          user={selected}
          managers={managers}
          refusal={refusal}
          onRun={run}
          by={authorisedBy}
        />
      ) : (
        <div className="cust-nosel">
          <div>
            <h2>No users</h2>
            <p className="muted">Unreachable in practice — M-04 d14 keeps at least one Manager.</p>
          </div>
        </div>
      )}

      <UserLog user={draft ? null : selected} managers={managers} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function NewUserCard({
  draft,
  managers,
  refusal,
  by,
  onChange,
  onCancel,
  onAdd,
}: {
  draft: { name: string; initials: string; role: UserRole };
  managers: number;
  refusal: string | null;
  by: ManagerAuth;
  onChange: (p: Partial<{ name: string; initials: string; role: UserRole }>) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  return (
    <section className="cust-main">
      <div className="cust-head">
        <h2>New user</h2>
        <span className="small muted">Authorised by {by.name}</span>
      </div>
      <div className="cust-scroll">
        <div className="stack">
          {refusal && <div className="callout danger">{refusal}</div>}
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={draft.name}
              placeholder="e.g. A. Nakamura"
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>
              Initials{" "}
              <SpecNote cite="M-04 d13, d20">
                Unique among <strong>active</strong> users and refused at creation, so the Manager
                resolves a clash there and then rather than the till disambiguating at use. Stored
                trimmed and upper-cased (d20), so <code>jd</code> and <code>JD</code> cannot both
                exist.
              </SpecNote>
            </span>
            <input
              value={draft.initials}
              maxLength={4}
              placeholder="e.g. AN"
              onChange={(e) => onChange({ initials: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={draft.role} onChange={(e) => onChange({ role: e.target.value as UserRole })}>
              <option value="Employee">Employee</option>
              <option value="Manager">Manager</option>
            </select>
          </label>
          <p className="small muted">
            No credentials are issued — v1 identifies by initials only (E-01 d3), so there is no
            invite step (M-04 d7). That changes the day credentials arrive; E-01 d18 lists what has
            to be revisited then.
          </p>
          <p className="small muted">This Store has {managers} active Manager{managers === 1 ? "" : "s"}.</p>
        </div>
      </div>
      <div className="cust-acct-foot">
        <button className="btn primary cust-primary" onClick={onAdd}>
          Add user
        </button>
        <div className="cust-foot-sub">
          Name and unique initials are the only two required.{" "}
          <button className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function UserCard({
  user,
  managers,
  refusal,
  onRun,
  by,
}: {
  user: User;
  managers: number;
  refusal: string | null;
  onRun: (r: UserWriteResult) => boolean;
  // The Manager who authorised this screen (M-04 d11, A-28a). Every log row
  // written here carries their name rather than a constant.
  by: ManagerAuth;
}) {
  const app = useApp();
  // d22 — corrections. Live fields like the Supplier and Customer cards, but
  // committed on BLUR rather than per keystroke, because each commit appends a
  // log row (A-55) and committing live would file one per character. Same
  // trade M-01 d13 already made.
  const [name, setName] = useState(user.name);
  const [initials, setInitials] = useState(user.initials);
  const [reactivateWith, setReactivateWith] = useState(user.initials);

  const lastManager = user.active && user.role === "Manager" && managers <= 1;

  return (
    <section className="cust-main">
      <div className="cust-head">
        <h2>
          {user.name}{" "}
          <span className={"badge" + (user.active ? "" : " off")}>
            {user.active ? user.role : "Deactivated"}
          </span>
        </h2>
        <span className="small muted">{user.initials}</span>
      </div>

      <div className="cust-scroll">
        <div className="stack">
          {refusal && <div className="callout danger">{refusal}</div>}

          <label className="field">
            <span>
              Name{" "}
              <SpecNote cite="M-04 d22">
                Correcting is not reassigning: it changes what this row is called, never which row
                a past action points at. Because every audit surface resolves through to the User
                (d16), a correction shows <strong>retroactively</strong> — fix a name today and
                last month's Sales show the corrected one. The log is the only place the old value
                survives, and paper already printed does not follow.
              </SpecNote>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name !== user.name) {
                  if (!onRun(app.correctUser(user.id, { name }, by))) setName(user.name);
                }
              }}
            />
          </label>

          <label className="field">
            <span>Initials</span>
            <input
              value={initials}
              maxLength={4}
              onChange={(e) => setInitials(e.target.value)}
              onBlur={() => {
                if (initials.trim().toUpperCase() !== user.initials) {
                  if (!onRun(app.correctUser(user.id, { initials }, by)))
                    setInitials(user.initials);
                }
              }}
            />
          </label>

          {user.active && (
            <PasswordField key={user.id} user={user} onRun={onRun} by={by} />
          )}

          {user.active ? (
            <>
              <div className="field">
                <span>Role</span>
                <div className="btn-row">
                  <button
                    className={"btn" + (user.role === "Employee" ? " primary" : " ghost")}
                    onClick={() => onRun(app.changeUserRole(user.id, "Employee", by))}
                  >
                    Employee
                  </button>
                  <button
                    className={"btn" + (user.role === "Manager" ? " primary" : " ghost")}
                    onClick={() => onRun(app.changeUserRole(user.id, "Manager", by))}
                  >
                    Manager
                  </button>
                </div>
              </div>
              <p className="small muted">
                A role change takes effect on the next session for what the shell draws, but every
                manager-only function resolves the authorising person to an active Manager{" "}
                <em>at the moment of the call</em> — so a demotion bites server-side at once
                (A-55).
              </p>
            </>
          ) : (
            <div className="field">
              <span>
                Reactivate with initials{" "}
                <SpecNote cite="M-04 d19">
                  Reactivation restores the <strong>original</strong> row, so one person keeps one
                  history (d5). Their old initials may have been reissued in the meantime — d16
                  released them — so this asks rather than assuming, and refuses a clash by naming
                  who holds them.
                </SpecNote>
              </span>
              <div className="btn-row">
                <input
                  value={reactivateWith}
                  maxLength={4}
                  onChange={(e) => setReactivateWith(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={() => onRun(app.reactivateUser(user.id, reactivateWith, by))}
                >
                  Reactivate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="cust-acct-foot">
        {user.active && (
          <button
            className="btn danger cust-primary"
            // Deliberately NOT disabled on the last Manager — see the note at
            // the top of this file. The store refuses and says why.
            onClick={() => onRun(app.deactivateUser(user.id, by))}
            title={lastManager ? "Will be refused — this is the only active Manager" : undefined}
          >
            Deactivate
          </button>
        )}
        <div className="cust-foot-sub">
          Users are deactivated, never deleted (d5) — attribution has to survive their leaving.
          {lastManager && " This is the only active Manager, so it will be refused (d14)."}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

// E-01 d21 — optional, for anyone, up to 8 characters. Deliberately plain
// about what it is: the screen says "barrier", not "security", because a shop
// setting it to one letter should not think it has done more than it has.
function PasswordField({
  user,
  onRun,
  by,
}: {
  user: User;
  onRun: (r: UserWriteResult) => boolean;
  by: ManagerAuth;
}) {
  const app = useApp();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  if (!open)
    return (
      <div className="field">
        <span>Password</span>
        <div className="btn-row">
          <span className="small muted" style={{ flex: 1 }}>
            {user.password
              ? "Set — asked when this person opens a session or authorises a manager-only action."
              : "None. Optional for anyone, Manager or Employee."}
          </span>
          <button className="btn ghost sm" onClick={() => setOpen(true)}>
            {user.password ? "Change" : "Set"}
          </button>
          {user.password && (
            <button
              className="btn ghost sm"
              onClick={() => onRun(app.setUserPassword(user.id, "", by))}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="field">
      <span>
        Password{" "}
        <SpecNote cite="E-01 d21">
          A <strong>barrier, not authentication</strong>. Up to 8 characters, optional for anyone,
          and a single letter is a legitimate choice — it exists so that typing a Manager's
          initials at an unattended till is not by itself enough to reach the manager-only space.
          The log records that it changed and <strong>never what it was</strong>. A password
          holder's session is capped at the 5-minute default however long the shop set its lapse
          to.
        </SpecNote>
      </span>
      <div className="btn-row">
        <input
          type="password"
          autoFocus
          value={value}
          maxLength={8}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="btn primary sm"
          onClick={() => {
            if (onRun(app.setUserPassword(user.id, value, by))) {
              setValue("");
              setOpen(false);
            }
          }}
        >
          Save
        </button>
        <button
          className="btn ghost sm"
          onClick={() => {
            setValue("");
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function UserLog({ user, managers }: { user: User | null; managers: number }) {
  return (
    <aside className="cust-acct">
      <div className="cust-head">
        <h3>Log</h3>
      </div>
      <div className="cust-scroll">
        <div className="stack">
          <div className="callout small">
            <strong>
              {managers} active Manager{managers === 1 ? "" : "s"}
            </strong>
            <div className="muted">
              A Store always has at least one (M-04 d14). Demoting or deactivating the last one is
              refused in the write path at every role — including a Manager doing it to themselves.
              No authorisation lifts it, and there is no tier above Manager to lift it with (d11).
            </div>
          </div>

          {user ? (
            <>
              <div className="small muted">
                Actor, timestamp and before-and-after, on the same log a role change appends to
                (A-55). Without it, who promoted whom exists nowhere after the second change — and
                this is the privilege boundary.
              </div>
              <ul className="loglist">
                {[...user.log].reverse().map((l, i) => (
                  <li key={i}>
                    <span className="small muted">{l.at.replace("T", " ")}</span>
                    <div>{l.text}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="small muted">Select a user to see their log.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
