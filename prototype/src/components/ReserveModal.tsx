import { useState } from "react";
import type { InventoryItem, RecordEntry } from "../data/types";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";
import { Modal } from "./Modal";

// Shared by the titlecard's per-copy Reserve button (one known copy) and the
// Search results row's Reserve button (a Record with possibly several
// sellable copies — the picker only appears when there's a real choice).
export function ReserveModal({
  record,
  items,
  initialItemId,
  onClose,
  onDone,
}: {
  record: RecordEntry;
  items: InventoryItem[];
  initialItemId?: string;
  onClose: () => void;
  onDone: (saleId: string) => void;
}) {
  const app = useApp();
  const [itemId, setItemId] = useState(initialItemId ?? items[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(app.customers[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const item = items.find((i) => i.id === itemId);

  return (
    <Modal
      title={`Reserve — ${record.artist} — ${record.title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!customerId || !itemId || qty < 1}
            onClick={() => onDone(app.reserve(record.id, itemId, customerId, qty))}
          >
            Reserve &amp; open at till
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Reserving stock on hand creates a <strong>Held</strong> Sale (E-05) with an{" "}
          <span className="mono">H</span>-prefixed hold reference. The copy stays on hand but leaves
          available stock. <em>(E-04 → E-05 inherited.)</em>
        </p>
        {items.length > 1 ? (
          <label className="field">
            <span>Which copy</span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.grade} · {money(i.price)} · {i.internalBarcode}
                </option>
              ))}
            </select>
          </label>
        ) : (
          item && (
            <div className="small muted">
              Copy — <span className="badge grade">{item.grade}</span> {money(item.price)}{" "}
              <span className="mono">{item.internalBarcode}</span>
            </div>
          )
        )}
        <label className="field">
          <span>Customer</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {app.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.accountNumber})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Quantity</span>
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
