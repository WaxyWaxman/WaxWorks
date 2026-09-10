import { useState } from "react";
import { MANAGER_NAME } from "../data/seed";
import { Modal } from "./Modal";

// manager override (lexicon §2) — performed in place by the Manager entering
// their initials, without displacing the Employee's session; both names recorded.
export function ManagerOverride({
  reason,
  onConfirm,
  onCancel,
}: {
  reason: string;
  onConfirm: (by: string) => void;
  onCancel: () => void;
}) {
  const [initials, setInitials] = useState("");
  return (
    <Modal
      title="Manager override required"
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
