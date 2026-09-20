import { useState } from "react";
import { useApp } from "../store/AppStore";
import { OTP_CODE, signInPersonal as checkPersonal } from "../lib/signIn";

// The three doors (E-01 d24, d27, d28; S-01 d4), one screen.
//
// EVERYTHING BEHIND THESE DOORS IS A STAND-IN for Supabase Auth (A-87, A-91):
// passwords compared in memory, a one-time code that is a constant, a passkey
// that is a button. Every fake is labelled on the screen, because a reviewer
// who reads an OTP prompt as security has been misled by the prototype. What
// is REAL here is the shape — which door exists for whom, what a refusal says,
// and that the store session is the counter's whole access.
//
// The seeded credentials are printed on the screen for the same reason the
// prototype prints decision numbers: this is a review surface, not a product.

type Door = "store" | "personal" | "sysadmin";

export function SignIn() {
  const app = useApp();
  const [door, setDoor] = useState<Door>("store");

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="signin-brand">
          <span className="dot" /> Wax Works
        </div>
        <div className="signin-doors" role="tablist" aria-label="How to sign in">
          <DoorTab door="store" cur={door} set={setDoor} label="Store account" cite="E-01 d24" />
          <DoorTab door="personal" cur={door} set={setDoor} label="Sign in as yourself" cite="E-01 d27" />
          <DoorTab door="sysadmin" cur={door} set={setDoor} label="WaxWorks staff" cite="S-01 d4" />
        </div>
        {door === "store" && <StoreDoor />}
        {door === "personal" && <PersonalDoor />}
        {door === "sysadmin" && <SysadminDoor />}
      </div>

      <aside className="signin-crib callout small">
        <strong>Prototype — seeded credentials.</strong> Nothing here is a real credential; the
        product's are Supabase Auth's and this code never sees them (A-87, A-91).
        <table>
          <tbody>
            {app.stores.map((s) => (
              <tr key={s.id}>
                <td>Store account · {s.id}</td>
                <td>
                  <code>{s.accountEmail}</code> / <code>{s.accountPassword}</code>
                </td>
              </tr>
            ))}
            {app.users
              .filter((u) => u.active && u.password)
              .map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name} ({u.role})
                  </td>
                  <td>
                    <code>{u.email}</code> / <code>{u.password}</code>
                    {u.pin ? (
                      <>
                        {" "}
                        · PIN <code>{u.pin}</code>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            {app.sysadmins.map((sa) => (
              <tr key={sa.id}>
                <td>{sa.name} (System Administrator)</td>
                <td>
                  <code>{sa.email}</code> · passkey
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted">
          One-time code for every personal sign-in: <code>{OTP_CODE}</code>. Employees have no
          personal sign-in — they enter initials on a store session (E-01 d25, d27).
        </div>
      </aside>
    </div>
  );
}

function DoorTab({ door, cur, set, label, cite }: { door: Door; cur: Door; set: (d: Door) => void; label: string; cite: string }) {
  return (
    <button role="tab" aria-selected={cur === door} className={"signin-door" + (cur === door ? " on" : "")} onClick={() => set(door)}>
      {label}
      <span className="flow">{cite}</span>
    </button>
  );
}

// E-01 d24 — the Store's own email and password. A terminal signs in once and
// holds a store session that does not lapse.
function StoreDoor() {
  const app = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [bad, setBad] = useState<string | null>(null);

  const submit = () => {
    const r = app.signInStoreAccount(email, password, terminalId);
    if (!r.ok) setBad(r.refusal);
  };

  return (
    <form
      className="signin-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>Open a store session on this terminal</h2>
      <p className="muted small">
        Shared and always on. Staff enter their initials on top of it; Managers their PIN at the
        manager-only line. It ends when somebody signs out or an Owner rotates the store account
        (E-01 d24).
      </p>
      <label className="field">
        <span>Store account email</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      <label className="field">
        <span>This terminal</span>
        <select value={terminalId} onChange={(e) => setTerminalId(e.target.value)}>
          <option value="">First till of the Store</option>
          {app.terminals.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · Store {t.storeId}
            </option>
          ))}
        </select>
        <span className="small muted">A terminal keeps a name of its own for its drawer and receipts (A-87). Prototype: pick one; the product remembers it.</span>
      </label>
      {bad && <div className="callout danger small">{bad}</div>}
      <div className="btn-row">
        <button className="btn primary" type="submit">
          Sign in the store
        </button>
      </div>
    </form>
  );
}

// E-01 d27, d28 — a Manager or Owner as themselves: email, password, then a
// second factor. The store mints the session only with all three.
function PersonalDoor() {
  const app = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"password" | "otp">("password");
  const [bad, setBad] = useState<string | null>(null);

  const next = () => {
    // The password is checked first only to decide whether to show the second
    // step; the store checks it again with the code (E-01 d28).
    const r = checkPersonal(app.users, email, password);
    if (!r.ok) return setBad(r.refusal);
    setBad(null);
    setStep("otp");
  };
  const finish = () => {
    const r = app.signInPersonal(email, password, otp);
    if (!r.ok) setBad(r.refusal);
  };

  return (
    <form
      className="signin-form"
      onSubmit={(e) => {
        e.preventDefault();
        step === "password" ? next() : finish();
      }}
    >
      <h2>Sign in as yourself</h2>
      <p className="muted small">
        For a Manager or Owner. Nothing on a personal session asks for initials or a PIN, and
        nothing lapses; you pick a Store and may switch (E-01 d27). Employees have no personal
        sign-in.
      </p>
      {step === "password" ? (
        <>
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
        </>
      ) : (
        <label className="field">
          <span>One-time code</span>
          <input value={otp} inputMode="numeric" onChange={(e) => setOtp(e.target.value)} autoFocus />
          <span className="small muted">
            Second factor (E-01 d28): a code by email or phone, or a passkey. <strong>Prototype:</strong>{" "}
            there is no phone to send it to — the code is <code>{OTP_CODE}</code>.
          </span>
        </label>
      )}
      {bad && <div className="callout danger small">{bad}</div>}
      <div className="btn-row">
        <button className="btn primary" type="submit">
          {step === "password" ? "Continue" : "Sign in"}
        </button>
        {step === "otp" && (
          <button className="btn ghost" type="button" onClick={() => setStep("password")}>
            Back
          </button>
        )}
      </div>
    </form>
  );
}

// S-01 d4 — a passkey, or nothing. The prototype's passkey is a button, and
// says so.
function SysadminDoor() {
  const app = useApp();
  const [email, setEmail] = useState("");
  const [bad, setBad] = useState<string | null>(null);

  return (
    <form
      className="signin-form"
      onSubmit={(e) => {
        e.preventDefault();
        const r = app.signInSysadmin(email);
        if (!r.ok) setBad(r.refusal);
      }}
    >
      <h2>WaxWorks staff</h2>
      <p className="muted small">
        A System Administrator reaches identity data only — Organizations, Stores, people, the
        user-change log — and never anything a Store sells, holds or owes (S-01 d1). Passkey
        only; a password alone opens nothing (S-01 d4).
      </p>
      <label className="field">
        <span>Email</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
      </label>
      {bad && <div className="callout danger small">{bad}</div>}
      <div className="btn-row">
        <button className="btn primary" type="submit">
          Use passkey
        </button>
        <span className="small muted">Prototype: the passkey is this button.</span>
      </div>
    </form>
  );
}
