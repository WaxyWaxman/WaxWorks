import { useState } from "react";
import { useApp } from "../store/AppStore";
import { Modal } from "./Modal";
import { ManagerOverride } from "./ManagerOverride";
import type { ReviewFlagKind } from "../data/types";

const KIND_LABEL: Record<ReviewFlagKind, string> = {
  "below-cost": "Below cost",
  "total-adjustment": "Total adjustment",
  "discrepancy-accepted": "Discrepancy accepted",
  "negative-stock": "Negative stock",
  "sale-lock-broken": "Sale lock broken",
};

// M-04 decision 8 — actions that used to block on a manager override now
// proceed and raise a flag here instead. Acknowledging one is itself a
// manager-only action, gated the same way any other manager action is.
export function ReviewQueueBadge() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [acking, setAcking] = useState<string | null>(null);
  const unacked = app.reviewFlags.filter((f) => !f.acknowledged);

  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}>
        🚩 {unacked.length}
      </button>
      {open && (
        <Modal title="Review queue" onClose={() => setOpen(false)} wide>
          <div className="stack">
            {app.reviewFlags.length === 0 && <p className="small muted">Nothing raised yet.</p>}
            {app.reviewFlags.map((f) => (
              <div key={f.id} className="card">
                <div className="card-body">
                  <div className="btn-row" style={{ justifyContent: "space-between" }}>
                    <span>
                      <span className="badge">{KIND_LABEL[f.kind]}</span>{" "}
                      <span className="small muted">{f.at}</span>
                    </span>
                    {f.acknowledged ? (
                      <span className="badge ok">
                        Acknowledged{f.acknowledgedBy ? ` · ${f.acknowledgedBy}` : ""}
                      </span>
                    ) : (
                      <button className="btn sm primary" onClick={() => setAcking(f.id)}>
                        Acknowledge
                      </button>
                    )}
                  </div>
                  <p style={{ marginTop: "var(--sp-2)" }}>{f.summary}</p>
                  <p className="small muted">Recorded by {f.recordedBy}</p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {acking && (
        <ManagerOverride
          reason="Acknowledge this review flag."
          onCancel={() => setAcking(null)}
          onConfirm={(by) => {
            app.acknowledgeReviewFlag(acking, by);
            setAcking(null);
          }}
        />
      )}
    </>
  );
}
