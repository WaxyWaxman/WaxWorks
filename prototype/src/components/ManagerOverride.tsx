import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/AppStore";
import { resolveInitials, resolutionHint } from "../lib/identify";
import { passwordAccepted, PASSWORD_MAX } from "../lib/users";

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
// NOTE ON THE NAME: this component is called ManagerOverride, but *manager
// override* is a RETIRED term (M-04 d8, lexicon) — the actions it used to
// gate now proceed and raise a ReviewFlag. What survives is **manager-only**:
// an action an Employee cannot perform at all. `title` lets a caller say so
// correctly without renaming the component out from under seven screens.
//
// It used to accept any two characters typed into it, so the prototype's
// manager-only gate was satisfied by initials belonging to nobody.
export function ManagerOverride({
  reason,
  title = "Manager only",
  onConfirm,
  onCancel,
}: {
  reason: string;
  title?: string;
  onConfirm: (by: string) => void;
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
      else onConfirm(`${who.name} (Manager)`);
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
    if (passwordAccepted(person, pw)) onConfirm(`${person.name} (Manager)`);
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
