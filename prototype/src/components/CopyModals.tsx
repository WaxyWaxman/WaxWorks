import { useState } from "react";
import { Modal } from "./Modal";
import type { InventoryItem, RecordEntry } from "../data/types";
import { money, roundUpShelf } from "../lib/money";
import { useApp } from "../store/AppStore";

// Two modals that act on a single copy. They were local to TitlecardPanel
// until Find grew a second place to reach a copy from (the answer track), and
// a modal defined inside one screen's panel is not reachable from another.
// Nothing about them changed in the move.

export function PrintLabelModal({
  item,
  record,
  onClose,
  onDone,
}: {
  item: InventoryItem;
  record: RecordEntry;
  onClose: () => void;
  onDone: (confirmation: string) => void;
}) {
  const [qty, setQty] = useState(1);

  const commit = () => {
    onDone(
      `Printed ${qty} label${qty === 1 ? "" : "s"} — ${item.internalBarcode} ` +
        `(${item.grade}, ${money(item.price)}).`,
    );
    onClose();
  };

  return (
    <Modal
      title={`Print label — ${record.artist} — ${record.title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={qty < 1} onClick={commit}>
            Print {qty} label{qty === 1 ? "" : "s"}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          A Code 128 store label for this copy, with condition and price printed as human-readable
          text alongside the code — legible without a scanner, and the code itself stays an opaque
          ID so re-grading or re-pricing later doesn't require a reprint. <em>(PRD §4.3.)</em>
        </p>
        <div className="small muted">
          <span className="badge grade">{item.grade}</span> {money(item.price)} ·{" "}
          <span className="mono">{item.internalBarcode}</span>
        </div>
        <label className="field">
          <span>Number of copies</span>
          <input
            className="inline-num"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          />
        </label>
      </div>
    </Modal>
  );
}

export function PriceEditModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const app = useApp();
  const [raw, setRaw] = useState(String(item.price));
  const next = Number(raw) || 0;
  const rounded = roundUpShelf(next);
  const belowCost = next < item.cost;

  const commit = () => {
    app.setCopyPrice(item.id, rounded);
    onClose();
  };

  return (
    <Modal
      title="Edit copy price (shelf price)"
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={next <= 0} onClick={commit}>
            Save price
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="small muted">
          Cost {money(item.cost)} · current shelf {money(item.price)}
        </div>
        <label className="field">
          <span>New shelf price</span>
          <input type="number" step="0.01" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </label>
        <div className="callout">
          Rounds up to <strong>{money(rounded)}</strong> — shelf prices suggest ending in{" "}
          <span className="mono">.50</span> or <span className="mono">.99</span>, though any amount
          is accepted (E-02 decision 32 / E-04 decision 17).
        </div>
        {belowCost && (
          <div className="callout">
            <strong>Below cost.</strong> This proceeds and raises a review flag for a manager
            rather than blocking (M-04 decision 8) — no override needed.
          </div>
        )}
      </div>
    </Modal>
  );
}
