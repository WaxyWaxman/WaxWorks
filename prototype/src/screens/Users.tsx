import { useMemo, useState } from "react";
import type { ManagerAuth } from "../lib/managerAuth";
import { useNavigate, useParams } from "react-router-dom";
import { SpecNote } from "../components/SpecNote";
import { isManagerial, type Store, type User, type UserRole } from "../data/types";
import { readStored, writeStored } from "../lib/tillMemory";
import { adminRefusal, withArticle } from "../lib/userAdminPolicy";
import { useApp, type UserWriteResult } from "../store/AppStore";
import { ManagerAuthorize } from "../components/ManagerAuthorize";

// M-04 Users, on the till's three tracks like every other back-office screen:
// the slab you look in, the person you opened, and their log.
//
// Three things about this screen are not cosmetic.
//
// FIRST, nothing here is enforced by disabling a button. Architecture A-89
// puts every invariant in the write path — initials and PIN uniqueness as
// assertions under a lock, the Owner floor as an assertion under a lock, and
// M-04 d30's reach as a policy the store applies after re-resolving the
// actor — so every action calls the store and renders whatever reason comes
// back. What the screen OFFERS follows the same policy (`adminRefusal`), so a
// Manager is not shown a Manager to demote; but the refusal is the rule, and
// the Deactivate button on the last Owner is LIVE and tells you why not.
//
// SECOND, every row shows a NAME, not initials alone. M-04 d16 releases a
// deactivated user's initials to a new hire, and E-01 d25 makes them unique
// only per Store, so the letters stop identifying a person — the seed carries
// T. Oyelaran (gone) and T. Okonkwo (current) both as TO, and E. Okafor and E.
// Ouellet both as EO at two different Stores, to make that visible.
//
// THIRD, who crossed the line decides what is offered. On a store session a
// PIN opened this screen; on a personal session the session did (M-04 d31).
// Either way the authoriser is a real active Manager or Owner, and their name
// is what every log row carries.

const SLAB_KEY = "waxworks.users.slab";

type Filter = "active" | "managers" | "owners" | "inactive" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "managers", label: "Managers" },
  { key: "owners", label: "Owners" },
  { key: "inactive", label: "Deactivated" },
  { key: "all", label: "Everyone" },
];

type Draft = { name: string; initials: string; role: UserRole; assignments: string[]; email: string; pin: string };

export function Users() {
  const app = useApp();
  const nav = useNavigate();
  const { userId } = useParams();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [draft, setDraft] = useState<Draft | null>(null);
  // One refusal at a time, shown where the action was taken. Cleared by the
  // next action rather than by a timer, so it cannot vanish while being read.
  const [refusal, setRefusal] = useState<string | null>(null);
  // Gated as a WHOLE rather than per action (M-04 d24, d31): administering
  // users is a sitting-down job, and a prompt per row is d12's
  // trains-you-not-to-read problem again. The authoriser's name lands in every
  // log row from then on.
  const [authorisedBy, setAuthorisedBy] = useState<ManagerAuth | null>(null);

  const setSlab = (v: boolean) => {
    setSlabOpen(v);
    writeStored(SLAB_KEY, v);
  };

  // The person who crossed the line, as a row — what they may do follows from
  // their role and Stores (M-04 d30).
  const actor = authorisedBy ? (app.users.find((u) => u.id === authorisedBy.userId) ?? null) : null;
  // Only this Organization's people (A-86): a Store screen never lists another Organization's.
  const people = app.orgUsers;
  const owners = people.filter((u) => u.active && u.role === "Owner").length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((u) => {
        if (filter === "active" && !u.active) return false;
        if (filter === "inactive" && u.active) return false;
        if (filter === "managers" && !(u.active && isManagerial(u.role))) return false;
        if (filter === "owners" && !(u.active && u.role === "Owner")) return false;
        if (!q) return true;
        return u.name.toLowerCase().includes(q) || u.initials.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }, [people, query, filter]);

  const counts = useMemo(
    () => ({
      active: people.filter((u) => u.active).length,
      managers: people.filter((u) => u.active && isManagerial(u.role)).length,
      owners,
      inactive: people.filter((u) => !u.active).length,
      all: people.length,
    }),
    [people, owners],
  );

  const selectedId = userId ?? rows[0]?.id ?? people[0]?.id ?? null;
  const selected = people.find((u) => u.id === selectedId) ?? null;

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
    if (!draft || !authorisedBy) return;
    const r = app.addUser(
      {
        name: draft.name,
        initials: draft.initials,
        role: draft.role,
        assignments: draft.assignments,
        email: draft.email.trim() || undefined,
        pin: draft.pin.trim() || undefined,
      },
      authorisedBy,
    );
    if (run(r) && r.ok) {
      setDraft(null);
      setQuery("");
      nav(`/users/${r.id}`);
    }
  };

  if (!authorisedBy || !actor)
    return (
      <ManagerAuthorize
        title="Users — manager only"
        reason="User administration is manager-only (A-55, A-89); a Manager reaches Employees at their own Stores, and anything touching a Manager or Owner is Owner-only (M-04 d30). Authorised once for the screen (d24, d31); the authoriser's name is recorded against everything done here."
        onConfirm={(by) => setAuthorisedBy(by)}
        onCancel={() => nav(-1)}
      />
    );

  const storeName = (id: string) => app.storeDetailsFor(id).tradingName;

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
              <input type="search" value={query} placeholder="Name or initials" onChange={(e) => setQuery(e.target.value)} />
              <button
                className="btn primary"
                onClick={() => {
                  setRefusal(null);
                  setDraft({
                    name: "",
                    initials: "",
                    role: "Employee",
                    // The Store in session is pre-ticked: a hire is usually for here.
                    assignments: app.currentStoreId ? [app.currentStoreId] : [],
                    email: "",
                    pin: "",
                  });
                }}
              >
                ＋ New
              </button>
            </div>
            <div className="slab-chips">
              {FILTERS.map((f) => (
                <button key={f.key} className={"filter-chip" + (filter === f.key ? " on" : "")} onClick={() => setFilter(f.key)}>
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
                      {u.assignments.length ? ` · ${u.assignments.map(storeName).join(", ")}` : " · no Store"}
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
          actor={actor}
          stores={app.stores.filter((s) => s.active)}
          storeName={storeName}
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
          actor={actor}
          owners={owners}
          stores={app.stores.filter((s) => s.active)}
          storeName={storeName}
          refusal={refusal}
          onRun={run}
          by={authorisedBy}
        />
      ) : (
        <div className="cust-nosel">
          <div>
            <h2>No users</h2>
            <p className="muted">Unreachable in practice — M-04 d26 keeps at least one Owner.</p>
          </div>
        </div>
      )}

      <UserLog user={draft ? null : selected} owners={owners} actor={actor} />
    </div>
  );
}

// ---------------------------------------------------------------------------

// What a Manager may touch (M-04 d30), asked of the same policy the store
// enforces — so the screen never offers what the write path would refuse, and
// never hides what it would permit.
function may(actor: User, action: Parameters<typeof adminRefusal>[1]): boolean {
  return adminRefusal(actor, action) === undefined;
}

function StoreChecks({
  stores,
  chosen,
  storeName,
  canToggle,
  onToggle,
  whyNot = "not one of your Stores",
}: {
  stores: Store[];
  chosen: string[];
  storeName: (id: string) => string;
  canToggle: (storeId: string) => boolean;
  onToggle: (storeId: string, on: boolean) => void;
  whyNot?: string;
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      {stores.map((s) => {
        const on = chosen.includes(s.id);
        const enabled = canToggle(s.id);
        return (
          <label key={s.id} className={"small" + (enabled ? "" : " muted")} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={on} disabled={!enabled} onChange={(e) => onToggle(s.id, e.target.checked)} />
            {storeName(s.id)} <span className="muted">· {s.id}</span>
            {!enabled && <span className="muted">— {whyNot}</span>}
          </label>
        );
      })}
    </div>
  );
}

function NewUserCard({
  draft,
  actor,
  stores,
  storeName,
  refusal,
  by,
  onChange,
  onCancel,
  onAdd,
}: {
  draft: Draft;
  actor: User;
  stores: Store[];
  storeName: (id: string) => string;
  refusal: string | null;
  by: ManagerAuth;
  onChange: (p: Partial<Draft>) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  // A Manager may add Employees only (M-04 d30); an Owner anyone. The select
  // offers what the policy allows; the write path refuses regardless.
  const roles: UserRole[] = (["Employee", "Manager", "Owner"] as UserRole[]).filter((r) =>
    may(actor, { kind: "add", role: r, assignments: draft.assignments.length ? draft.assignments : [actor.assignments[0] ?? ""] }),
  );
  const managerial = isManagerial(draft.role);

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
            <input autoFocus value={draft.name} placeholder="e.g. A. Nakamura" onChange={(e) => onChange({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>
              Initials{" "}
              <SpecNote cite="M-04 d13, d20, d27 / E-01 d25">
                Unique among the <strong>active</strong> users <strong>assigned to each Store</strong>{" "}
                this person is given, and refused at creation — the clash is resolved there and then
                rather than the till disambiguating at use. Two people in the Organization may share
                initials if no Store has both. Stored trimmed and upper-cased (d20).
              </SpecNote>
            </span>
            <input value={draft.initials} maxLength={4} placeholder="e.g. AN" onChange={(e) => onChange({ initials: e.target.value })} />
          </label>
          <label className="field">
            <span>
              Role{" "}
              <SpecNote cite="M-04 d25, d30">
                Employee ⊂ Manager ⊂ Owner. A Manager may add Employees at their own Stores; adding a
                Manager or Owner is <strong>Owner-only</strong>. What this list offers follows that rule,
                and the write path refuses what it should not have offered.
              </SpecNote>
            </span>
            <select value={draft.role} onChange={(e) => onChange({ role: e.target.value as UserRole })}>
              {(["Employee", "Manager", "Owner"] as UserRole[]).map((r) => (
                <option key={r} value={r} disabled={!roles.includes(r)}>
                  {r}
                  {roles.includes(r) ? "" : " — Owner-only"}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>
              Stores{" "}
              <SpecNote cite="M-04 d27">
                Where this person's initials and PIN resolve. Employees and Managers need at least one;
                an Owner may have none. A Manager assigns to their own Stores only (d30).
              </SpecNote>
            </span>
            <StoreChecks
              stores={stores}
              chosen={draft.assignments}
              storeName={storeName}
              canToggle={(id) => actor.role === "Owner" || actor.assignments.includes(id)}
              onToggle={(id, on) =>
                onChange({ assignments: on ? [...draft.assignments, id] : draft.assignments.filter((x) => x !== id) })
              }
            />
          </div>
          <label className="field">
            <span>
              Email{managerial ? "" : " (optional)"}{" "}
              <SpecNote cite="M-04 d29">
                A Manager or Owner is <strong>invited by email</strong> and sets their own password through
                the link — nobody types it for them. An Employee has no personal sign-in and needs none.
              </SpecNote>
            </span>
            <input value={draft.email} placeholder={managerial ? "required — the invite goes here" : "none needed"} onChange={(e) => onChange({ email: e.target.value })} />
          </label>
          {managerial && (
            <label className="field">
              <span>
                PIN (optional at Add){" "}
                <SpecNote cite="M-04 d28, d32">
                  Four digits for the manager-only line on a store session; unique among the Managers and
                  Owners assigned to each Store. A clash is refused as <em>in use at this Store</em> with no
                  name. Whether a Manager may be saved without one is M-04's open question.
                </SpecNote>
              </span>
              <input type="password" inputMode="numeric" maxLength={4} value={draft.pin} onChange={(e) => onChange({ pin: e.target.value.replace(/\D/g, "") })} />
            </label>
          )}
        </div>
      </div>
      <div className="cust-acct-foot">
        <button className="btn primary cust-primary" onClick={onAdd}>
          Add user
        </button>
        <div className="cust-foot-sub">
          {managerial ? "An invite is sent on Add." : "Name, initials and a Store are required."}{" "}
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
  actor,
  owners,
  stores,
  storeName,
  refusal,
  onRun,
  by,
}: {
  user: User;
  actor: User;
  owners: number;
  stores: Store[];
  storeName: (id: string) => string;
  refusal: string | null;
  onRun: (r: UserWriteResult) => boolean;
  by: ManagerAuth;
}) {
  const app = useApp();
  // d22 — corrections. Live fields like the Supplier and Customer cards, but
  // committed on BLUR rather than per keystroke, because each commit appends a
  // log row (A-55) and committing live would file one per character.
  const [name, setName] = useState(user.name);
  const [initials, setInitials] = useState(user.initials);
  const [email, setEmail] = useState(user.email ?? "");
  const [reactivateWith, setReactivateWith] = useState(user.initials);

  const lastOwner = user.active && user.role === "Owner" && owners <= 1;
  const canCorrect = may(actor, { kind: "correct", role: user.role, assignments: user.assignments });
  const canRole = (to: UserRole) => may(actor, { kind: "changeRole", from: user.role, to, assignments: user.assignments });
  const canDeactivate = may(actor, { kind: "deactivate", role: user.role, assignments: user.assignments });
  const canPin = may(actor, { kind: "setPin", role: user.role, assignments: user.assignments });
  const canReset = may(actor, { kind: "requestReset", role: user.role, assignments: user.assignments });

  return (
    <section className="cust-main">
      <div className="cust-head">
        <h2>
          {user.name} <span className={"badge" + (user.active ? "" : " off")}>{user.active ? user.role : "Deactivated"}</span>
        </h2>
        <span className="small muted">{user.initials}</span>
      </div>

      <div className="cust-scroll">
        <div className="stack">
          {refusal && <div className="callout danger">{refusal}</div>}
          {!canCorrect && (
            <div className="callout small">
              You may read this record and not change it{canPin ? " — except the PIN, which a Manager sets for a Manager or Owner at their own Stores (M-04 d28)" : ""}. {withArticle(user.role)[0].toUpperCase() + withArticle(user.role).slice(1)} is otherwise touched by an Owner
              {user.role === "Employee" ? ", or by a Manager of their Stores" : ""} (M-04 d30). The buttons stay live; the write path is what refuses.
            </div>
          )}

          <label className="field">
            <span>
              Name{" "}
              <SpecNote cite="M-04 d22">
                Correcting is not reassigning: it changes what this row is called, never which row a
                past action points at. Because every audit surface resolves through to the User (d16), a
                correction shows <strong>retroactively</strong>.
              </SpecNote>
            </span>
            <input
              value={name}
              disabled={!canCorrect}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name !== user.name && !onRun(app.correctUser(user.id, { name }, by))) setName(user.name);
              }}
            />
          </label>

          <label className="field">
            <span>Initials{!user.initials && " — none yet; required before a Store assignment (M-04 d34)"}</span>
            <input
              value={initials}
              maxLength={4}
              disabled={!canCorrect}
              onChange={(e) => setInitials(e.target.value)}
              onBlur={() => {
                if (initials.trim().toUpperCase() !== user.initials && !onRun(app.correctUser(user.id, { initials }, by)))
                  setInitials(user.initials);
              }}
            />
          </label>

          <label className="field">
            <span>Email{isManagerial(user.role) ? "" : " (optional)"}</span>
            <input
              value={email}
              disabled={!canCorrect}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => {
                if (email.trim() !== (user.email ?? "") && !onRun(app.correctUser(user.id, { email }, by))) setEmail(user.email ?? "");
              }}
            />
          </label>

          <div className="field">
            <span>
              Stores{" "}
              <SpecNote cite="M-04 d27">
                Assignment is the second enforcement point: a Store where this person's initials are held
                refuses them, naming the holder; one where a Manager's PIN is held refuses it, naming
                nobody (d32). Unassigning an Employee's or Manager's last Store is refused — deactivate
                them instead.
              </SpecNote>
            </span>
            <StoreChecks
              stores={stores}
              chosen={user.assignments}
              storeName={storeName}
              canToggle={(id) => may(actor, { kind: "assign", role: user.role, storeId: id })}
              whyNot={isManagerial(user.role) && actor.role !== "Owner" ? "Owner-only (M-04 d30)" : "not one of your Stores"}
              onToggle={(id, on) => onRun(on ? app.assignToStore(user.id, id, by) : app.unassignFromStore(user.id, id, by))}
            />
          </div>

          {user.active && isManagerial(user.role) && canPin && <PinField key={user.id} user={user} onRun={onRun} by={by} />}

          {user.active && isManagerial(user.role) && canReset && <ResetField key={`reset-${user.id}`} user={user} onRun={onRun} by={by} />}

          {user.active ? (
            <>
              <div className="field">
                <span>
                  Role{" "}
                  <SpecNote cite="M-04 d25, d26, d30">
                    Any change to or from Manager or Owner is Owner-only. The last active Owner cannot be
                    demoted, including by themselves — an Organization always keeps one (d26). A demotion
                    to Employee clears the PIN (d28).
                  </SpecNote>
                </span>
                <div className="btn-row">
                  {(["Employee", "Manager", "Owner"] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      className={"btn" + (user.role === r ? " primary" : " ghost")}
                      disabled={user.role !== r && !canRole(r)}
                      title={user.role !== r && !canRole(r) ? "Owner-only (M-04 d30)" : undefined}
                      onClick={() => user.role !== r && onRun(app.changeUserRole(user.id, r, by))}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <p className="small muted">
                A role change takes effect on the next session for what the shell draws, but every
                manager-only function resolves the authorising person <em>at the moment of the call</em> —
                so a demotion bites server-side at once (A-55, A-89).
              </p>
            </>
          ) : (
            <div className="field">
              <span>
                Reactivate with initials{" "}
                <SpecNote cite="M-04 d19">
                  Reactivation restores the <strong>original</strong> row, so one person keeps one history
                  (d5). Their old initials may have been reissued at one of their Stores — d16 released
                  them — so this asks rather than assuming, and refuses a clash by naming who holds them.
                </SpecNote>
              </span>
              <div className="btn-row">
                <input value={reactivateWith} maxLength={4} onChange={(e) => setReactivateWith(e.target.value)} />
                <button className="btn primary" onClick={() => onRun(app.reactivateUser(user.id, reactivateWith, by))}>
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
            // Deliberately NOT disabled on the last Owner — see the note at the
            // top of this file. The store refuses and says why.
            onClick={() => onRun(app.deactivateUser(user.id, by))}
            title={lastOwner ? "Will be refused — this is the only active Owner" : !canDeactivate ? "Owner-only (M-04 d30)" : undefined}
          >
            Deactivate
          </button>
        )}
        <div className="cust-foot-sub">
          Users are deactivated, never deleted (d5) — attribution has to survive their leaving.
          {lastOwner && " This is the only active Owner, so it will be refused (d26)."}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

// M-04 d28 — a Manager's or Owner's four-digit PIN, set by an Owner or a
// Manager, never by its holder at the counter. The log records that it changed
// and never what it was; a clash is refused as "in use at this Store" with no
// name (d32). Employees have none.
function PinField({ user, onRun, by }: { user: User; onRun: (r: UserWriteResult) => boolean; by: ManagerAuth }) {
  const app = useApp();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  if (!open)
    return (
      <div className="field">
        <span>PIN</span>
        <div className="btn-row">
          <span className="small muted" style={{ flex: 1 }}>
            {user.pin
              ? "Set — typed alone at the manager-only line on a store session (E-01 d26)."
              : "None. Without one this person can do no manager-only work on a store session."}
          </span>
          <button className="btn ghost sm" onClick={() => setOpen(true)}>
            {user.pin ? "Change" : "Set"}
          </button>
          {user.pin && (
            <button className="btn ghost sm" onClick={() => onRun(app.setUserPin(user.id, "", by))}>
              Clear
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="field">
      <span>
        PIN{" "}
        <SpecNote cite="M-04 d28, d32">
          Exactly <strong>four digits</strong>, unique among the Managers and Owners assigned to each of this
          person's Stores. Set by an Owner or a Manager rather than chosen at the counter, where there is no
          private moment. The log records that it changed and <strong>never what it was</strong>; a clash is
          refused as <em>in use at this Store</em> with no name, and every refusal is logged (d32).
        </SpecNote>
      </span>
      <div className="btn-row">
        <input type="password" inputMode="numeric" autoFocus value={value} maxLength={4} autoComplete="off" onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} />
        <button
          className="btn primary sm"
          onClick={() => {
            if (onRun(app.setUserPin(user.id, value, by))) {
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

// M-04 d29 — nobody sets another person's password. An administrator triggers
// an emailed link; the person sets their own. The prototype has no email, so
// the link "lands" here, labelled as the fake it is, and the set-own-password
// write is the real thing under test.
function ResetField({ user, onRun, by }: { user: User; onRun: (r: UserWriteResult) => boolean; by: ManagerAuth }) {
  const app = useApp();
  const [sent, setSent] = useState(false);
  const [pw, setPw] = useState("");

  return (
    <div className="field">
      <span>
        Password{" "}
        <SpecNote cite="M-04 d29, E-01 d27">
          The personal-session credential. Set by its holder through an emailed link — an invite when they
          are added, a reset when one is requested. The log records that a link was sent and that a password
          was set, <strong>never a value, never the link</strong>.
        </SpecNote>
      </span>
      <div className="btn-row">
        <span className="small muted" style={{ flex: 1 }}>
          {user.password ? "Set by the user." : "Not yet set — the invite is outstanding."}
        </span>
        <button
          className="btn ghost sm"
          onClick={() => {
            if (onRun(app.requestPasswordReset(user.id, by))) setSent(true);
          }}
        >
          Send reset link
        </button>
      </div>
      {sent && (
        <div className="callout small" style={{ marginTop: 8 }}>
          <strong>Prototype — the emailed link lands here.</strong> In the product this form is on a page only{" "}
          {user.email} can reach.
          <div className="btn-row" style={{ marginTop: 6 }}>
            <input type="password" placeholder="new password (8+)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            <button
              className="btn primary sm"
              onClick={() => {
                if (onRun(app.setOwnPassword(user.id, pw))) {
                  setPw("");
                  setSent(false);
                }
              }}
            >
              Set my password
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserLog({ user, owners, actor }: { user: User | null; owners: number; actor: User }) {
  return (
    <aside className="cust-acct">
      <div className="cust-head">
        <h3>Log</h3>
      </div>
      <div className="cust-scroll">
        <div className="stack">
          <div className="callout small">
            <strong>
              {owners} active Owner{owners === 1 ? "" : "s"}
            </strong>
            <div className="muted">
              An Organization always keeps at least one (M-04 d26). Demoting or deactivating the last one
              is refused in the write path at every role — including an Owner doing it to themselves. No
              Store is required to have a Manager; a Store with none does its manager-only work through
              an Owner.
            </div>
          </div>
          <div className="callout small">
            <strong>
              You are {actor.name} ({actor.role})
            </strong>
            <div className="muted">
              {actor.role === "Owner"
                ? "An Owner administers everyone in the Organization."
                : `A Manager administers Employees at ${actor.assignments.length} Store${actor.assignments.length === 1 ? "" : "s"} and sets PINs there; anything touching a Manager or Owner is Owner-only (M-04 d30).`}
            </div>
          </div>

          {user ? (
            <>
              <div className="small muted">
                Actor, timestamp and before-and-after, on the same log a role change appends to (A-55).
                Credentials are logged as changed, never as a value (d28, d29).
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
