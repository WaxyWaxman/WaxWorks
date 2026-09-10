import { useState } from "react";
import type { InventoryItem, RecordEntry } from "../data/types";
import { money } from "../lib/money";
import { separatorCounts } from "../lib/totals";
import { useApp } from "../store/AppStore";
import { Modal } from "./Modal";
import { SeparatorSelect } from "./SeparatorSelect";

// A Record's current shelf price — the sticky price for New stock, else
// whatever an existing (unsold) copy is priced at. Just a default; freely
// overridden below.
function defaultSellPrice(record: RecordEntry, inventory: InventoryItem[]): number {
  if (record.stickyPrice) return record.stickyPrice;
  const copy = inventory.find((i) => i.recordId === record.id && i.status !== "sold");
  return copy?.price ?? 0;
}

// Raising a pending order line (M-02 Phase 1) from a titlecard's Order
// button. Joins the chosen Supplier's pending pile — nothing is sent yet; a
// Manager later confirms and sends it from Order Processing (Phase 2).
export function OrderModal({
  record,
  onClose,
  onDone,
}: {
  record: RecordEntry;
  onClose: () => void;
  onDone: (confirmation: string) => void;
}) {
  const app = useApp();
  const [supplierId, setSupplierId] = useState(record.preferredSupplierId ?? app.suppliers[0]?.id ?? "");
  const [separator, setSeparator] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const [sellPrice, setSellPrice] = useState(() => defaultSellPrice(record, app.inventory));
  const [customerId, setCustomerId] = useState("");
  const [followUpRaw, setFollowUpRaw] = useState("");

  const supplier = app.supplierFor(supplierId);
  const knownSeparators = supplierId ? [...separatorCounts(app.pendingOrders, supplierId).keys()].filter((k) => k !== "") : [];
  const followUpDays = followUpRaw.trim() ? Math.max(0, Number(followUpRaw) || 0) : undefined;
  const ready = !!supplierId && qty >= 1 && sellPrice > 0;

  const commit = () => {
    if (!ready) return;
    app.raisePendingOrderLine({
      recordId: record.id,
      supplierId,
      separator,
      qty,
      sellPrice,
      customerId: customerId || undefined,
      followUpDays,
    });
    onDone(
      `Added to ${supplier?.name ?? "the supplier"}'s pending order${separator ? ` (sep ${separator})` : ""} — ` +
        `${qty}× ${record.artist} — ${record.title} at ${money(sellPrice)}. Process it from Order Processing when ready.`,
    );
    onClose();
  };

  return (
    <Modal
      title={`Order — ${record.artist} — ${record.title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!ready} onClick={commit}>
            Add to pending order
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Joins the Supplier's pending pile — not sent anywhere yet. A Manager reviews and sends it
          later from <strong>Order Processing</strong>. <em>(M-02 Phase 1.)</em>
        </p>
        <label className="field">
          <span>Supplier — a default only, freely changeable per order</span>
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setSeparator(undefined);
            }}
          >
            {app.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.shortName})
                {s.id === record.preferredSupplierId ? " — preferred" : ""}
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
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="field">
          <span>Selling price — defaults to the current shelf price</span>
          <input
            className="inline-num"
            type="number"
            step="0.01"
            min={0}
            value={sellPrice}
            onChange={(e) => setSellPrice(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="field">
          <span>Ordering separator (optional) — splits this onto its own stream, sent separately</span>
          <SeparatorSelect value={separator ?? ""} knownSeparators={knownSeparators} onChange={setSeparator} />
        </label>
        <label className="field">
          <span>Customer (optional) — makes this a customer-attached line</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— none —</option>
            {app.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.accountNumber})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Follow-up flag (days, optional) — chase it if it hasn't arrived by then</span>
          <input
            className="inline-num"
            type="number"
            min={0}
            value={followUpRaw}
            onChange={(e) => setFollowUpRaw(e.target.value)}
            placeholder="none"
          />
        </label>
      </div>
    </Modal>
  );
}
