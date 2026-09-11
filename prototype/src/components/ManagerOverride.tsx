import { useState } from "react";
import { MANAGER_NAME } from "../data/seed";
import { Modal } from "./Modal";

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
  const [initials, setInitials] = useState("");
  return (
    <Modal
      title={title}
      onClose={onCancel}
      foot={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={initials.trim().length < 2}
            onClick={() => onConfirm(`${initials.trim().toUpperCase()} (via ${MANAGER_NAME})`)}
          >
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
        </label>
      </div>
    </Modal>
  );
}
