import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/AppStore";
import { resolveInitials, resolutionHint } from "../lib/identify";
import { passwordAccepted, PASSWORD_MAX } from "../lib/users";
import { authorizeManager, type ManagerAuth } from "../lib/managerAuth";

// Entering a manager-locked area or authorising a manager-only action.
//
// It looks and behaves like the ordinary initials prompt (E-01 d19) rather
// than a separate ceremony, because it is the same act: say who you are. The
// only differences are that it refuses anybody who is not an active Manager,
// and that it always asks.
//
// IT ALWAYS ASKS — E-01 d23. A session, even a Manager's own, does not carry
// you into a manager-locked area. The lapse is five minutes for a password
// holder and longer for everyone else, which is fine for staying inside an
// area you already opened, and not fine as the only thing between an
// unattended till and the manager-only space. Crossing the line is cheap to
// ask for and expensive to assume.
//
// NAMED FOR THE FUNCTION IT STANDS IN FOR. Architecture §6 calls this
// `manager_authorize`, and M-04's section heading is "Manager-only
// authorization", so the component now matches both.
//
// It was called ManagerAuthorize until this rename, after a term the lexicon
// RETIRED (M-04 d8): the actions a *manager override* used to gate now
// proceed and raise a ReviewFlag instead, and what survives is
// **manager-only** — an action an Employee cannot perform at all. The two are
// separate concepts and the old name named the wrong one.
//
// It also used to accept any two characters typed into it, so the prototype's
// manager-only gate was satisfied by initials belonging to nobody.
export function ManagerAuthorize({
  reason,
  title = "Manager only",
  onConfirm,
  onCancel,
}: {
  reason: string;
  title?: string;
  /**
   * `by` is the display name; `managerUserId` is the resolved Manager.
   *
   * Architecture §6 — *"the id is what the function trusts and the initials are
   * what it displays"*, because M-04 d16 releases a deactivated User's initials
   * to a new hire, so a string alone resolves to a different person over time.
   * A write path that gates on the string is gating on a label.
   */
  /**
   * `by` is a **ManagerAuth** — a display name proved to belong to an active
   * Manager (lib/managerAuth.ts). This component is the only place one is
   * minted, and a gated store function will not accept anything else, so the
   * compiler refuses a call that skipped the check.
   */
  onConfirm: (by: ManagerAuth, managerUserId: string) => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const [typed, setTyped] = useState("");
  const [pw, setPw] = useState("");
  const [pwBad, setPwBad] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const res = resolveInitials(app.users, typed);
  const who = res.kind === "one" ? res.user : null;
  // Resolving is not authorising: an Employee's initials resolve perfectly
  // well and must still be refused, by name rather than by a blank "no".
  const isManager = who?.role === "Manager";
  const person = pending ? app.users.find((u) => u.id === pending) ?? null : null;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (person) pwRef.current?.focus();
  }, [person]);

  // Resolve on the last keystroke like the ordinary prompt, pausing long
  // enough that the name is read before the dialog goes.
  useEffect(() => {
    if (!who || !isManager || person) return;
    const t = setTimeout(() => {
      if (who.password) setPending(who.id);
      else {
        // Minted by the resolver, not formatted here: the role and active
        // checks live in one place (§6's `manager_authorize`).
        const res = authorizeManager(app.users, who.id);
        if (res.ok) onConfirm(res.auth, who.id);
      }
    }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who?.id, isManager, person]);

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

  const submitPw = () => {
    if (!person) return;
    if (passwordAccepted(person, pw)) {
      const res = authorizeManager(app.users, person.id);
      if (res.ok) onConfirm(res.auth, person.id);
      else setPwBad(true);
    }
    else {
      setPwBad(true);
      setPw("");
    }
  };

  // An Employee who resolves is refused by name. Everything else falls
  // through to the ordinary hint, so "keep typing" still reads as progress.
  const hint = () => {
    if (who && !isManager) return `${who.name} is an Employee — this needs a Manager.`;
    return resolutionHint(res);
  };
  const denied = Boolean(who && !isManager);

  return (
    <div className="idy-scrim" onPointerDown={onCancel}>
      <div
        className="idy"
        role="dialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="idy-reason">{title}</div>
        {person ? (
          <>
            <div className="idy-who">{person.name}</div>
            <input
              ref={pwRef}
              className={"idy-input" + (pwBad ? " bad" : "")}
              type="password"
              value={pw}
              maxLength={PASSWORD_MAX}
              autoComplete="off"
              aria-label="Password"
              onChange={(e) => {
                setPw(e.target.value);
                setPwBad(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitPw()}
            />
            <div className={"idy-hint" + (pwBad ? " bad" : "")}>
              {pwBad ? "Not that password." : "Password, then Enter."}
            </div>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              className={"idy-input" + (denied || (res.kind === "none" && !res.partial) ? " bad" : "")}
              value={typed}
              maxLength={4}
              autoComplete="off"
              spellCheck={false}
              aria-label="Manager initials"
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className={"idy-hint" + (denied ? " bad" : who ? " ok" : "")}>{hint()}</div>
          </>
        )}
        <div className="idy-sub">{reason}</div>
        <div className="idy-foot">
          <span>
            Asked every time this line is crossed, session or not (E-01 d23). The Employee's
            session is not displaced; both names are recorded.
          </span>
          <span className="idy-esc">Esc cancels</span>
        </div>
      </div>
    </div>
  );
}
