import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/AppStore";
import { PIN_LENGTH } from "../lib/users";
import { authorizeFromPersonalSession, type ManagerAuth } from "../lib/managerAuth";

// Entering a manager-locked area or authorising a manager-only action.
//
// TWO DOORS, one component (E-01 d26, d27; A-89).
//
// On a STORE SESSION it is a PIN pad. Four digits, typed on their own — no
// initials first — resolved among the Managers and Owners ASSIGNED to the
// Store in session, and a miss NAMES NOBODY: the refusal says only that no
// Manager or Owner at this Store has that PIN, never whose it nearly was,
// because a pad that says "that is R. Delacroix's, and it is wrong" is an
// oracle. Initials are not secret and are refused by name; a PIN is a
// credential and is not.
//
// IT ALWAYS ASKS ON A STORE SESSION — E-01 d23 as amended by d26. A shared
// session, even one a Manager typed their initials into, does not carry
// anybody across the line. Crossing it is four digits to ask for and a hole
// with a timer on it to assume.
//
// On a PERSONAL SESSION it does not ask at all. The Manager or Owner signed
// in with a password and a second factor; the session IS the authorization
// (E-01 d27, M-04 d31), and asking again would be asking a stronger credential
// to vouch for itself. The component confirms at once and renders nothing.
//
// THE PIN IS VERIFIED WHERE THE WRITE HAPPENS, in the product: every M
// function on a store session takes `p_manager_pin` and resolves it itself
// (A-89), because a caller able to invoke the function can invent an id. The
// prototype's store stands in that place — `app.authorizeByPin` is
// `manager_authorize_pin` — and every gated store function still re-resolves
// the id it is handed (`requireManager`).
//
// NAMED FOR THE FUNCTION IT STANDS IN FOR. It used to be the initials prompt
// with a password step (E-01 d21, retired by d29); before that it was called
// ManagerOverride, after a term the lexicon retired (M-04 d8).
export function ManagerAuthorize({
  reason,
  title = "Manager only",
  onConfirm,
  onCancel,
}: {
  reason: string;
  title?: string;
  /**
   * `by` is a **ManagerAuth** — a display name proved to belong to an active
   * Manager or Owner (lib/managerAuth.ts). This component is the only place
   * one is minted from a PIN, and a gated store function will not accept
   * anything else, so the compiler refuses a call that skipped the check.
   * `managerUserId` is the resolved person — the id is what the function
   * trusts and the name is what it displays (architecture §3).
   */
  onConfirm: (by: ManagerAuth, managerUserId: string) => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ auth: ManagerAuth; userId: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // THE PERSONAL-SESSION DOOR. Confirm on mount and render nothing.
  const personal = app.isPersonalSession ? app.sessionUser : null;
  useEffect(() => {
    if (!personal) return;
    const res = authorizeFromPersonalSession(app.users, personal.id);
    if (res.ok) onConfirm(res.auth, personal.id);
    else onCancel(); // an Employee's personal session does not exist (E-01 d27); nothing to authorize with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personal?.id]);

  useEffect(() => {
    if (!personal) inputRef.current?.focus();
  }, [personal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // THE STORE-SESSION DOOR. Submit on the fourth digit, like initials resolve
  // on the last keystroke (E-01 d19): no Enter, no OK. The name is shown only
  // AFTER success, held long enough to be read, and never before.
  useEffect(() => {
    if (personal || pin.length !== PIN_LENGTH || resolved) return;
    const res = app.authorizeByPin(pin);
    if (!res.ok) {
      setBad(res.refusal);
      setPin("");
      return;
    }
    setResolved({ auth: res.auth, userId: res.userId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, personal, resolved]);

  // Confirm in its own effect, keyed on the resolution, so the pause that lets
  // the name be read is not cancelled by the re-render that painted it.
  useEffect(() => {
    if (!resolved) return;
    const t = setTimeout(() => onConfirm(resolved.auth, resolved.userId), 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  if (personal) return null;

  return (
    <div className="idy-scrim" onPointerDown={onCancel}>
      <div className="idy" role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <div className="idy-reason">{title}</div>
        {resolved ? (
          <div className="idy-who">{resolved.auth.name}</div>
        ) : (
          <input
            ref={inputRef}
            className={"idy-input pin" + (bad ? " bad" : "")}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            maxLength={PIN_LENGTH}
            autoComplete="off"
            aria-label="Manager PIN"
            onChange={(e) => {
              setBad(null);
              setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH));
            }}
          />
        )}
        <div className={"idy-hint" + (bad ? " bad" : resolved ? " ok" : "")}>
          {bad ? bad : resolved ? "Authorised." : `Manager's PIN — ${PIN_LENGTH} digits.`}
        </div>
        <div className="idy-sub">{reason}</div>
        <div className="idy-foot">
          <span>
            Asked every time this line is crossed on a store session (E-01 d26). The Employee's
            session is not displaced; both names are recorded. A wrong PIN names nobody.
          </span>
          <span className="idy-esc">Esc cancels</span>
        </div>
      </div>
    </div>
  );
}
