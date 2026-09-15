import { useState } from "react";
import { Modal } from "./Modal";
import { useApp } from "../store/AppStore";
import { resolveInitials } from "../lib/identify";
import { passwordAccepted, PASSWORD_MAX } from "../lib/users";

// In-place authorisation by a Manager entering their own initials, without
// displacing the Employee's session; both names are recorded (M-04 d3, d4).
//
// NOTE ON THE NAME: this component is called ManagerOverride and titles itself
// "Manager override required", but *manager override* is a RETIRED term
// (M-04 d8, lexicon §2) — the actions it used to gate now proceed and raise a
// ReviewFlag instead. What survives, and what this mechanism actually serves,
// is **manager-only**: an action an Employee cannot perform at all. The
// existing call sites are all manager-only actions, so the component is doing
// the right thing under the wrong name. `title` lets a caller say so correctly
// without renaming the component out from under four other screens.
//
// It used to accept any two characters typed into it, which meant the
// prototype's manager-only gate was satisfied by initials belonging to nobody.
// It now resolves against a real, ACTIVE Manager — architecture A-55 requires
// manager_authorize to do exactly that at the moment of the call — and asks
// for the password where that Manager has one (E-01 d21).
export function ManagerOverride({
  reason,
  title = "Manager override required",
  onConfirm,
  onCancel,
}: {
  reason: string;
  title?: string;
  onConfirm: (by: string) => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const [initials, setInitials] = useState("");
  const [pw, setPw] = useState("");
  const [pwBad, setPwBad] = useState(false);

  const res = resolveInitials(app.users, initials);
  const who = res.kind === "one" ? res.user : null;
  // Resolution alone is not authorisation: an Employee's initials resolve
  // perfectly well and must still be refused here.
  const isManager = who?.role === "Manager";
  const needsPw = Boolean(who?.password);
  const ready = Boolean(isManager) && (!needsPw || pw.length > 0);

  const submit = () => {
    if (!who || !isManager) return;
    if (needsPw && !passwordAccepted(who, pw)) {
      setPwBad(true);
      setPw("");
      return;
    }
    onConfirm(`${who.name} (Manager)`);
  };

  const hint = () => {
    if (res.kind === "empty") return "Manager initials.";
    if (res.kind === "none") return res.partial ? "Keep typing." : "No active user with those initials.";
    if (!isManager) return `${who!.name} is an Employee — this needs a Manager.`;
    return who!.name;
  };

  return (
    <Modal
      title={title}
      onClose={onCancel}
      foot={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" disabled={!ready} onClick={submit}>
            Authorise
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="callout">{reason}</div>
        <p className="small muted">
          The Employee's session is not displaced. Both the Employee and the authorising
          Manager are recorded against this action.
        </p>
        <label className="field">
          <span>Manager initials</span>
          <input
            type="text"
            autoFocus
            value={initials}
            maxLength={4}
            placeholder="e.g. RD"
            onChange={(e) => setInitials(e.target.value)}
          />
          <span className={"hint" + (res.kind === "one" && !isManager ? " bad" : "")}>{hint()}</span>
        </label>
        {needsPw && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={pw}
              maxLength={PASSWORD_MAX}
              autoComplete="off"
              onChange={(e) => {
                setPw(e.target.value);
                setPwBad(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && ready && submit()}
            />
            <span className={"hint" + (pwBad ? " bad" : "")}>
              {pwBad ? "Not that password." : "A barrier, not a login (E-01 d21)."}
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
