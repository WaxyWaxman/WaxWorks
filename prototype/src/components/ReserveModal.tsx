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
  onDone: (confirmation: string) => void;
}) {
  const app = useApp();
  const [itemId, setItemId] = useState(initialItemId ?? items[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(app.customers[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [po, setPo] = useState("");
  const item = items.find((i) => i.id === itemId);

  // Holds for the same customer under the same PO (blank counts as a PO of
  // its own) merge onto one Held Sale as extra lines instead of piling up
  // separate tickets for what's really one pickup.
  const poKey = po.trim();
  const existingHold = app.sales.find(
    (x) => x.state === "Held" && x.customerId === customerId && (x.po ?? "").trim() === poKey,
  );

  const commit = () => {
    const cust = app.customerFor(customerId);
    const { holdRef } = app.reserve(record.id, itemId, customerId, qty, po);
    onDone(
      `On hold — ${holdRef} for ${cust?.name ?? "customer"}${poKey ? ` (PO ${poKey})` : ""}: ` +
        `${record.artist} — ${record.title} (${item?.grade ?? ""}, qty ${qty}). Open at the till ` +
        `when they're ready to tender.`,
    );
  };

  return (
    <Modal
      title={`Put on hold — ${record.artist} — ${record.title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!customerId || !itemId || qty < 1} onClick={commit}>
            Put on hold
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Sets the copy aside without ringing it up — the common case is a customer calling ahead,
          not standing at the counter. Creates a <strong>Held</strong> Sale (E-05) with an{" "}
          <span className="mono">H</span>-prefixed hold reference; it stays on hand but leaves
          available stock, and is tendered later from <strong>E-05 Sell</strong>.{" "}
          <em>(E-04 → E-05 inherited.)</em>
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
        <label className="field">
          <span>PO (optional)</span>
          <input
            type="text"
            value={po}
            onChange={(e) => setPo(e.target.value)}
            placeholder="leave blank if the customer doesn't have one"
          />
        </label>
        {existingHold && (
          <div className="callout ok small">
            Adds to existing hold <strong>{existingHold.holdRef}</strong> for this customer
            {poKey ? ` under PO ${poKey}` : " (no PO)"} — {existingHold.lines.length} item
            {existingHold.lines.length === 1 ? "" : "s"} on it already.
          </div>
        )}
      </div>
    </Modal>
  );
}
