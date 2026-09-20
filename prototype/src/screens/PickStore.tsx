import { useApp } from "../store/AppStore";

// E-01 d27 — the Store pick on a personal session.
//
// An Owner may pick any active Store of the Organization; a Manager only one
// they are assigned to. The pick is a WRITE in the product (A-87:
// `session_select_store`, copied into the next token) so that "one Store at a
// time" is a property of the read path and not of this screen; here it swaps
// the Store's slice into state (`loadStore`), which is the same shape.
//
// Whether a Manager may READ a sister Store without assignment is O-01's open
// question; until it is decided the list is the narrow one.
export function PickStore({ onPicked }: { onPicked?: () => void }) {
  const app = useApp();
  const stores = app.selectableStores();
  const me = app.sessionUser;

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="signin-brand">
          <span className="dot" /> Wax Works
        </div>
        <h2>Which Store?</h2>
        <p className="muted small">
          {me ? `${me.name} (${me.role})` : "Signed in"} — signed in as yourself. Everything Store-scoped —
          a Sale, a receiving, a setting — applies to the Store you pick; switching is one act from
          the session menu (E-01 d27).
        </p>
        {stores.length === 0 && (
          <div className="callout small">
            You are not assigned to any active Store. An Owner assigns people to Stores in Users
            (M-04 d27).
          </div>
        )}
        <div className="stack">
          {stores.map((s) => (
            <button
              key={s.id}
              className={"btn store-pick" + (s.id === app.currentStoreId ? " primary" : "")}
              onClick={() => {
                const r = app.selectStore(s.id);
                if (r.ok) onPicked?.();
              }}
            >
              <span className="store-pick-name">{app.storeDetailsFor(s.id).tradingName}</span>
              <span className="muted small">
                Store ID {s.id} · position {s.position}
              </span>
            </button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={() => app.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
