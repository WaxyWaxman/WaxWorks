import { useState } from "react";
import { CLAIM_REASONS, type InventoryItem, type RecordEntry } from "../data/types";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";
import { Modal } from "./Modal";

const CUSTOM_REASON = "Custom…";

// Raises a claim against the supplier a copy actually arrived from — only
// copies with a traceable supplier Invoice (arrivedOnInvoice/supplierId) are
// claimable; a second-hand counter buy has no supplier to claim against.
// The claim itself isn't sent from here — it's batched onto a Draft claim
// for that supplier (E-04 §"Supplier claims") and sent later from Supplier
// Claims, same two-stage shape as Order Processing.
export function ClaimModal({
  record,
  items,
  onClose,
  onDone,
}: {
  record: RecordEntry;
  items: InventoryItem[];
  onClose: () => void;
  onDone: (confirmation: string) => void;
}) {
  const app = useApp();
  const claimable = items.filter((i) => i.supplierId);
  const [itemId, setItemId] = useState(claimable[0]?.id ?? "");
  const [reasonChoice, setReasonChoice] = useState<string>("Received damaged");
  const [customReason, setCustomReason] = useState("");
  const [qty, setQty] = useState(1);
  const [separator, setSeparator] = useState("");
  const [note, setNote] = useState("");

  const item = claimable.find((i) => i.id === itemId);
  const supplier = app.supplierFor(item?.supplierId);
  const sepKey = separator.trim();
  const reason = reasonChoice === CUSTOM_REASON ? customReason.trim() : reasonChoice;

  const existingDraft = app.claims.find(
    (c) => c.status === "Draft" && c.supplierId === item?.supplierId && (c.separator ?? "").trim() === sepKey,
  );

  const commit = () => {
    if (!item) return;
    const res = app.raiseClaim(item.id, reason, qty, separator, note.trim() || undefined);
    if (!res) return;
    onDone(
      `Claim raised against ${res.supplierName}${sepKey ? ` (sep ${sepKey})` : ""} — ` +
        `${record.artist} — ${record.title}, ${reason}, qty ${qty}. Added to a Draft claim — ` +
        `send it from Supplier Claims.`,
    );
    onClose();
  };

  return (
    <Modal
      title={`Claim vs. supplier — ${record.artist} — ${record.title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!item || qty < 1 || !reason} onClick={commit}>
            Add to claim
          </button>
        </>
      }
    >
      {claimable.length === 0 ? (
        <div className="callout">
          No copy of this Record traces to a supplier Invoice — claims apply to supplier-shipped
          stock, not counter buys. <em>(E-04 §"Supplier claims".)</em>
        </div>
      ) : (
        <div className="stack">
          <p className="small">
            Claims accumulate against the supplier as a Draft — batched by supplier and separator,
            the same way pending orders are (M-02) — and are sent together later from{" "}
            <strong>Supplier Claims</strong>. <em>(E-04 decision 9.)</em>
          </p>
          <label className="field">
            <span>Which copy</span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {claimable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.grade} · {money(i.cost)} cost · {i.arrivedOnInvoice ?? "no invoice #"}
                </option>
              ))}
            </select>
          </label>
          {supplier && <div className="small muted">Supplier — {supplier.name}</div>}
          <label className="field">
            <span>Reason</span>
            <select value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)}>
              {CLAIM_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={CUSTOM_REASON}>{CUSTOM_REASON}</option>
            </select>
          </label>
          {reasonChoice === CUSTOM_REASON && (
            <label className="field">
              <span>Custom reason</span>
              <input type="text" autoFocus value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="e.g. Sleeve split in transit" />
            </label>
          )}
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
            <span>Ordering separator (optional) — batches this with matching pending orders/claims</span>
            <input
              type="text"
              maxLength={1}
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              placeholder="leave blank for the regular pile"
            />
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {existingDraft && (
            <div className="callout ok small">
              Adds to the existing Draft claim for {supplier?.name}
              {sepKey ? ` under separator ${sepKey}` : ""} — {existingDraft.lines.length} line
              {existingDraft.lines.length === 1 ? "" : "s"} on it already.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
