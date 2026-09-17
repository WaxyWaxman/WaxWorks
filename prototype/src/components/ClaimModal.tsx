import { useState } from "react";
import { CLAIM_REASONS, type InventoryItem, type RecordEntry } from "../data/types";
import { money } from "../lib/money";
import type { ClaimLineAgainst } from "../data/types";
import { eligibleInvoices } from "../lib/claims";
import { invoiceForItem, provenanceLabel, supplierIdForItem } from "../lib/provenance";
import { useApp } from "../store/AppStore";
import { useActor } from "./Identify";
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
  const withActor = useActor();
  // A-45 — claimable means the copy has paperwork behind it. An oversold
  // copy has none until it is reconciled, and there is nobody to claim from.
  const claimable = items.filter((i) => supplierIdForItem(i, app.invoices));
  const [itemId, setItemId] = useState(claimable[0]?.id ?? "");
  const [reasonChoice, setReasonChoice] = useState<string>("Received damaged");
  const [customReason, setCustomReason] = useState("");
  const [qty, setQty] = useState(1);
  const [separator, setSeparator] = useState("");
  const [note, setNote] = useState("");
  // E-04 d28 — which of this Supplier's received Invoices the line is about.
  // "" is the explicit NO-INVOICE choice, not an unfilled field: the option
  // says so in words, which is the difference between a decision and a blank.
  const [againstId, setAgainstId] = useState<string | null>(null);

  const item = claimable.find((i) => i.id === itemId);
  const supplier = app.supplierFor(item ? supplierIdForItem(item, app.invoices) : undefined);
  const sepKey = separator.trim();
  const reason = reasonChoice === CUSTOM_REASON ? customReason.trim() : reasonChoice;

  const existingDraft = app.claims.find(
    (c) => !c.sentAt && c.supplierId === supplier?.id && (c.separator ?? "").trim() === sepKey,
  );

  // The Invoices this line may name (d28): that Supplier's finalized ones —
  // what the store actually received stock on. Never a typed number.
  const eligible = supplier ? eligibleInvoices(record.id, supplier.id, app.invoices) : [];
  // Until someone picks, the line follows the copy: the Invoice it arrived on.
  const arrivedOn = item ? invoiceForItem(item, app.invoices) : undefined;
  const chosen = againstId === null ? (arrivedOn?.id ?? "") : againstId;

  // Tier 2 (d5). claim_create stays an Employee action (A-38), so it needs an actor rather than a Manager.
  const commit = () =>
    withActor("Raise claim", () => {
    if (!item) return;
    const against: ClaimLineAgainst = chosen ? { kind: "invoice", invoiceId: chosen } : { kind: "none" };
    const res = app.raiseClaim(item.id, reason, qty, separator, note.trim() || undefined, against);
    if (!res) return;
    onDone(
      `Claim raised against ${res.supplierName}${sepKey ? ` (sep ${sepKey})` : ""} — ` +
        `${record.artist} — ${record.title}, ${reason}, qty ${qty}. Added to an unsent batch — ` +
        `send it from Supplier Claims.`,
    );
    onClose();
  });;

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
            Claims accumulate against the supplier in a standing batch — one per supplier and separator,
            the same way pending orders are (M-02) — and are sent together later from{" "}
            <strong>Supplier Claims</strong>. <em>(E-04 decision 9.)</em>
          </p>
          <label className="field">
            <span>Which copy</span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {claimable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.grade} · {money(i.cost)} cost · {provenanceLabel(i, app.invoices, app.suppliers) ?? "no invoice"}
                </option>
              ))}
            </select>
          </label>
          {supplier && <div className="small muted">Supplier — {supplier.name}</div>}
          <label className="field">
            <span>Which invoice this is about</span>
            <select value={chosen} onChange={(e) => setAgainstId(e.target.value)}>
              {eligible.map((iv) => (
                <option key={iv.id} value={iv.id}>
                  {iv.invoiceNumber} · {iv.invoiceDate}
                  {arrivedOn?.id === iv.id ? " — this copy arrived on it" : ""}
                </option>
              ))}
              <option value="">Not about a specific invoice</option>
            </select>
            <span className="hint">
              Every invoice this supplier has shipped <strong>{record.title}</strong> to us on — not only the one this
              copy came in on, because they may credit against a different shipment of it (d28). It is{" "}
              <strong>evidence of what is being argued</strong>, never where the credit lands: that is decided by
              ticking in Accounts Payable (M-05 d27).
            </span>
          </label>
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
