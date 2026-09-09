import { useEffect, useState } from "react";
import { ManagerOverride } from "../components/ManagerOverride";
import { Modal } from "../components/Modal";
import {
  GRADES,
  type Grade,
  type IntakeMode,
  type InvoiceLine,
  type PendingOrderLine,
  type RecordEntry,
  type Section,
  type Supplier,
} from "../data/types";
import { money, roundUpShelf } from "../lib/money";
import { round2 } from "../lib/totals";
import { useApp } from "../store/AppStore";

export function Receiving() {
  const app = useApp();
  const drafts = app.invoices.filter((iv) => iv.status === "Draft");
  const finalized = app.invoices.filter((iv) => iv.status === "Finalized");
  const recent = [...finalized]
    .sort((a, b) => (b.finalizedAt ?? "").localeCompare(a.finalizedAt ?? ""))
    .slice(0, 3);
  const [selectedId, setSelectedId] = useState<string | null>(drafts[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);
  const selected = app.invoiceFor(selectedId ?? undefined);

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">E-02</span>
        <div>
          <h1>Receive inventory</h1>
          <p className="sub">
            Intake a shipment, identify each record, price it, and reconcile against the
            supplier's invoice. Nothing here is sellable until <strong>Finalize</strong> — E-05
            already supports negative inventory for exactly this gap (decision 21).
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body row wrap">
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New intake
          </button>
          <button className="btn" onClick={() => setOpening(true)}>
            Open existing
          </button>
          <span className="muted xsmall">Open:</span>
          {drafts.length === 0 && <span className="xsmall muted">none</span>}
          {drafts.map((iv) => {
            const supplier = app.supplierFor(iv.supplierId);
            return (
              <button
                key={iv.id}
                className={"btn sm" + (iv.id === selectedId ? " primary" : "")}
                onClick={() => setSelectedId(iv.id)}
              >
                {supplier?.shortName} {iv.invoiceNumber} · {iv.lines.length} line
                {iv.lines.length === 1 ? "" : "s"}
              </button>
            );
          })}
          {recent.length > 0 && (
            <>
              <span className="muted xsmall">Recently received:</span>
              {recent.map((iv) => {
                const supplier = app.supplierFor(iv.supplierId);
                return (
                  <button
                    key={iv.id}
                    className={"btn ghost sm" + (iv.id === selectedId ? " primary" : "")}
                    onClick={() => setSelectedId(iv.id)}
                  >
                    {supplier?.shortName} {iv.invoiceNumber}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {!selected && <div className="callout">Start a new intake, resume a draft, or open an existing invoice above.</div>}
      {selected && <InvoiceEditor key={selected.id} invoiceId={selected.id} />}

      {creating && (
        <NewInvoiceModal onClose={() => setCreating(false)} onCreated={(id) => setSelectedId(id)} />
      )}
      {opening && (
        <OpenExistingModal
          onClose={() => setOpening(false)}
          onPick={(id) => {
            setSelectedId(id);
            setOpening(false);
          }}
        />
      )}
    </div>
  );
}

function OpenExistingModal({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const app = useApp();
  const [term, setTerm] = useState("");
  const q = term.trim().toLowerCase();
  const results = [...app.invoices]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((iv) => {
      if (!q) return true;
      const supplier = app.supplierFor(iv.supplierId);
      return (
        iv.invoiceNumber.toLowerCase().includes(q) ||
        supplier?.name.toLowerCase().includes(q) ||
        supplier?.shortName.toLowerCase().includes(q)
      );
    });

  return (
    <Modal title="Open existing invoice" wide onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Search — supplier or invoice #</span>
          <input type="text" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <table className="data">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Invoice #</th>
              <th>Mode</th>
              <th>Status</th>
              <th className="num">Lines</th>
            </tr>
          </thead>
          <tbody>
            {results.map((iv) => {
              const supplier = app.supplierFor(iv.supplierId);
              return (
                <tr key={iv.id} className="row-click" onClick={() => onPick(iv.id)}>
                  <td>{supplier?.name}</td>
                  <td className="mono small">{iv.invoiceNumber}</td>
                  <td className="small">{iv.intakeMode}</td>
                  <td>
                    <span className={"badge" + (iv.status === "Finalized" ? " ok" : "")}>{iv.status}</span>
                  </td>
                  <td className="num">{iv.lines.length}</td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td colSpan={5} className="muted small">
                  No invoices match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const app = useApp();
  const [supplierId, setSupplierId] = useState(app.suppliers[0]?.id ?? "");
  const [mode, setMode] = useState<IntakeMode>("New");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [statedSubtotal, setStatedSubtotal] = useState("0.00");
  const [tax, setTax] = useState("0.00");
  const [freight, setFreight] = useState("0.00");
  const [extracted, setExtracted] = useState(false);

  const numKey = invoiceNumber.trim().toLowerCase();
  const collision = app.invoices.find(
    (iv) => iv.supplierId === supplierId && iv.invoiceNumber.trim().toLowerCase() === numKey,
  );
  const [proceedAnyway, setProceedAnyway] = useState(false);

  const simulateExtraction = () => {
    setStatedSubtotal("25.00");
    setTax("1.25");
    setFreight("5.00");
    setExtracted(true);
  };

  const canSubmit =
    supplierId && invoiceNumber.trim() && receivedDate.trim() && (!collision || proceedAnyway);

  return (
    <Modal
      title="New intake"
      wide
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!canSubmit}
            onClick={() => {
              const id = app.startInvoice({
                supplierId,
                intakeMode: mode,
                invoiceNumber: invoiceNumber.trim(),
                invoiceDate: invoiceDate.trim(),
                receivedDate: receivedDate.trim(),
                statedSubtotal: Number(statedSubtotal) || 0,
                tax: Number(tax) || 0,
                freight: Number(freight) || 0,
              });
              onCreated(id);
              onClose();
            }}
          >
            Open invoice
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Intake mode — chosen once per invoice, no mixed invoices (decision 22)</span>
          <div className="row">
            <label className="row">
              <input type="radio" checked={mode === "New"} onChange={() => setMode("New")} />
              <span>New stock — condition defaults to Mint/Sealed, sets sticky price</span>
            </label>
          </div>
          <div className="row">
            <label className="row">
              <input
                type="radio"
                checked={mode === "Second-hand"}
                onChange={() => setMode("Second-hand")}
              />
              <span>Second-hand — grade required per copy, no sticky price</span>
            </label>
          </div>
        </label>

        <label className="field">
          <span>Supplier</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {app.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.shortName}) — {s.marginPct}% margin
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>
            {mode === "New"
              ? "Supplier's invoice number"
              : "Invoice number — or your own reference if there's no supplier paperwork"}
          </span>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="e.g. 55099"
          />
        </label>
        {collision && (
          <div className="callout danger">
            An invoice already exists for this supplier + number — check inventory rather than
            creating a duplicate. <em>(Decision 1/4.)</em>
            <div style={{ marginTop: "var(--sp-2)" }}>
              <label className="row">
                <input
                  type="checkbox"
                  checked={proceedAnyway}
                  onChange={(e) => setProceedAnyway(e.target.checked)}
                />
                <span>I've checked — this is genuinely a different invoice</span>
              </label>
            </div>
          </div>
        )}

        <div className="grid cols-2">
          <label className="field">
            <span>Invoice date (from paperwork)</span>
            <input type="text" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} placeholder="DD/MM/YYYY" />
          </label>
          <label className="field">
            <span>Received date</span>
            <input type="text" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </label>
        </div>

        <div className="callout">
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <span>
              Photograph the invoice — extracts <strong>totals only</strong>, not per-line costs
              (decision 15). No camera here, so:
            </span>
            <button className="btn sm" onClick={simulateExtraction}>
              Simulate photo extraction
            </button>
          </div>
          {extracted && <div className="xsmall muted" style={{ marginTop: 4 }}>Extracted — every field below stays editable, never a source of truth.</div>}
        </div>

        <div className="grid cols-3">
          <label className="field">
            <span>Stated subtotal</span>
            <input type="number" step="0.01" value={statedSubtotal} onChange={(e) => setStatedSubtotal(e.target.value)} />
          </label>
          <label className="field">
            <span>Tax</span>
            <input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </label>
          <label className="field">
            <span>Freight</span>
            <input type="number" step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

// Pricing shared by the fillable and edit rows. "Cost" in this UI is the
// pre-discount figure off the paperwork; what E-02 decision 7 calls "cost"
// (the post-discount Ext. Price) is derived here and shown small, not typed.
function useLinePricing(opts: {
  listRaw: string;
  discountRaw: string;
  sellRaw: string | null;
  autoAccept: boolean;
  stickyPrice?: number;
  supplier: Supplier;
}) {
  const listPrice = Number(opts.listRaw) || 0;
  const discountPct = Number(opts.discountRaw) || 0;
  const extPrice = round2(listPrice * (1 - discountPct / 100));
  const suggested = opts.stickyPrice ?? roundUpShelf(listPrice * (1 + opts.supplier.marginPct / 100));
  const sellPrice = opts.autoAccept ? suggested : Number(opts.sellRaw ?? suggested.toFixed(2)) || 0;
  const marginPct = sellPrice > 0 ? round2(((sellPrice - extPrice) / sellPrice) * 100) : 0;
  const belowCost = sellPrice > 0 && sellPrice < extPrice;
  return { listPrice, discountPct, extPrice, suggested, sellPrice, marginPct, belowCost };
}

function InvoiceEditor({ invoiceId }: { invoiceId: string }) {
  const app = useApp();
  const invoice = app.invoiceFor(invoiceId)!;
  const supplier = app.supplierFor(invoice.supplierId)!;

  const [autoAccept, setAutoAccept] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [prefillOrder, setPrefillOrder] = useState<PendingOrderLine | null>(null);
  const [rowResetKey, setRowResetKey] = useState(0);

  const locked = invoice.status === "Finalized";

  const derivedSubtotal = round2(invoice.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
  const mismatch = Math.abs(derivedSubtotal - invoice.statedSubtotal) > 0.01;
  const computedTotal = round2(derivedSubtotal + invoice.tax + invoice.freight + invoice.misc);
  const [totalOverrideRaw, setTotalOverrideRaw] = useState<string | null>(null);
  const totalRaw = totalOverrideRaw ?? computedTotal.toFixed(2);
  const enteredTotal = Number(totalRaw) || 0;
  const delta = round2(enteredTotal - computedTotal);
  const pctDelta = computedTotal !== 0 ? Math.abs(delta) / computedTotal : Math.abs(delta) > 0 ? 1 : 0;
  const needsOverride = Math.abs(delta) > 0.005 && pctDelta > 0.02;
  const [overrideTotal, setOverrideTotal] = useState<{ enteredTotal: number } | null>(null);
  const [finalizedCount, setFinalizedCount] = useState<number | null>(null);

  const doFinalize = () => {
    if (delta !== 0) app.setInvoiceTotalOverride(invoiceId, enteredTotal);
    const res = app.finalizeInvoice(invoiceId);
    if (res) setFinalizedCount(res.itemCount);
  };

  return (
    <div className="sell">
      <div className="stack">
        <div className="card">
          <div className="card-head">
            {supplier.shortName} {invoice.invoiceNumber} — {invoice.intakeMode}
            <span className={"badge" + (locked ? " ok" : "")}>{invoice.status}</span>
          </div>
          <div className="card-body stack">
            <div className="row wrap xsmall muted">
              <span>Invoice date {invoice.invoiceDate || "—"}</span>
              <span>Received {invoice.receivedDate}</span>
              <span>Supplier margin {supplier.marginPct}% (M-01, not editable in this pass)</span>
            </div>
            {locked && (
              <div className="callout">
                Finalized invoices are immutable — voids and amendments are manager-only, handled
                in E-04 (decision 23, not in this pass).
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            Lines
            <label className="row xsmall">
              <input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} />
              <span>Auto-accept suggested/sticky price (step 13)</span>
            </label>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Record</th>
                  <th>Grade</th>
                  <th className="num">Cost</th>
                  <th className="num">Disc%</th>
                  <th className="num">Sell price</th>
                  <th className="num">Margin%</th>
                  <th className="num">Qty</th>
                  <th className="num">Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) =>
                  editingLineId === l.id ? (
                    <EditLineRow
                      key={l.id}
                      invoiceId={invoiceId}
                      line={l}
                      mode={invoice.intakeMode}
                      supplier={supplier}
                      onDone={() => setEditingLineId(null)}
                    />
                  ) : (
                    <ReadLineRow
                      key={l.id}
                      line={l}
                      recordTitle={
                        app.recordFor(l.recordId)
                          ? `${app.recordFor(l.recordId)!.artist} — ${app.recordFor(l.recordId)!.title}`
                          : l.recordId
                      }
                      locked={locked}
                      onEdit={() => setEditingLineId(l.id)}
                      onRemove={() => app.removeInvoiceLine(invoiceId, l.id)}
                    />
                  ),
                )}
                {!locked && (
                  <NewLineRow
                    key={rowResetKey}
                    invoiceId={invoiceId}
                    mode={invoice.intakeMode}
                    supplier={supplier}
                    autoAccept={autoAccept}
                    prefillOrder={prefillOrder}
                    onPrefillConsumed={() => setPrefillOrder(null)}
                    onCommitted={(msg) => {
                      setNote(msg);
                      setRowResetKey((k) => k + 1);
                    }}
                  />
                )}
                {invoice.lines.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted small">
                      No lines yet — scan a barcode or use Lookup on the row above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {note && (
            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="callout ok">{note}</div>
            </div>
          )}
        </div>

        {!locked && (
          <OrdersPanel
            supplierId={supplier.id}
            onPick={(order) => setPrefillOrder(order)}
          />
        )}

        <div className="card">
          <div className="card-head">Log</div>
          <div className="card-body xsmall muted stack">
            {invoice.log.map((e, i) => (
              <div key={i}>
                <span className="mono">{e.at}</span> — {e.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">Reconcile</div>
          <div className="card-body stack">
            <div className="totals-row">
              <span>Derived subtotal (our line costs)</span>
              <strong className="num">{money(derivedSubtotal)}</strong>
            </div>
            <label className="field" style={{ margin: 0 }}>
              <span>Stated subtotal (from paperwork)</span>
              <input
                type="number"
                step="0.01"
                disabled={locked}
                value={invoice.statedSubtotal}
                onChange={(e) => app.updateInvoiceTotals(invoiceId, { statedSubtotal: Number(e.target.value) || 0 })}
              />
            </label>
            {mismatch && (
              <div className="callout">
                Derived subtotal doesn't match the supplier's stated subtotal — a discrepancy
                warning, not a block. Recheck the lines, or proceed if it's explainable.{" "}
                <em>(Decision 18.)</em>
              </div>
            )}
            <label className="field" style={{ margin: 0 }}>
              <span>Tax</span>
              <input
                type="number"
                step="0.01"
                disabled={locked}
                value={invoice.tax}
                onChange={(e) => app.updateInvoiceTotals(invoiceId, { tax: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Freight</span>
              <input
                type="number"
                step="0.01"
                disabled={locked}
                value={invoice.freight}
                onChange={(e) => app.updateInvoiceTotals(invoiceId, { freight: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Miscellaneous</span>
              <input
                type="number"
                step="0.01"
                disabled={locked}
                value={invoice.misc}
                onChange={(e) => app.updateInvoiceTotals(invoiceId, { misc: Number(e.target.value) || 0 })}
              />
            </label>
            <div className="hr" />
            <div className="totals-row">
              <span>Computed total</span>
              <span className="num">{money(computedTotal)}</span>
            </div>
            <label className="field" style={{ margin: 0 }}>
              <span>Total — ±2% reconciles freely, beyond that needs a manager override</span>
              <input
                type="number"
                step="0.01"
                disabled={locked}
                value={totalRaw}
                onChange={(e) => setTotalOverrideRaw(e.target.value)}
              />
            </label>
            {delta !== 0 && (
              <div className={"callout" + (needsOverride ? " danger" : "")}>
                Adjustment {money(delta)} ({(pctDelta * 100).toFixed(1)}%) — a standalone line into
                cost of goods, not redistributed across items (decision 21).
                {needsOverride && " Beyond ±2%: needs a manager override."}
                {invoice.totalOverrideBy && <div className="xsmall">Overridden by {invoice.totalOverrideBy}</div>}
              </div>
            )}
          </div>
        </div>

        {!locked && (
          <div className="card">
            <div className="card-body btn-row">
              <button
                className="btn primary lg"
                disabled={invoice.lines.length === 0}
                onClick={() => (needsOverride ? setOverrideTotal({ enteredTotal }) : doFinalize())}
              >
                {needsOverride ? "Reconcile (needs override) & finalize" : "Finalize"}
              </button>
            </div>
          </div>
        )}
      </div>

      {overrideTotal && (
        <ManagerOverride
          reason={`Reconcile ${supplier.shortName} ${invoice.invoiceNumber} total to ${money(overrideTotal.enteredTotal)} — ${money(delta)} beyond the ±2% bound.`}
          onCancel={() => setOverrideTotal(null)}
          onConfirm={(by) => {
            app.setInvoiceTotalOverride(invoiceId, overrideTotal.enteredTotal, by);
            const res = app.finalizeInvoice(invoiceId);
            setOverrideTotal(null);
            if (res) setFinalizedCount(res.itemCount);
          }}
        />
      )}
      {finalizedCount !== null && (
        <Modal
          title="Invoice finalized"
          onClose={() => setFinalizedCount(null)}
          foot={
            <button className="btn primary" onClick={() => setFinalizedCount(null)}>
              Done
            </button>
          }
        >
          <div className="callout ok">
            {finalizedCount} cop{finalizedCount === 1 ? "y" : "ies"} now sellable. A letter-size
            summary would print here (decision 22). The invoice is now immutable (decision 23).
          </div>
        </Modal>
      )}
    </div>
  );
}

function OrdersPanel({
  supplierId,
  onPick,
}: {
  supplierId: string;
  onPick: (order: PendingOrderLine) => void;
}) {
  const app = useApp();
  const [term, setTerm] = useState("");
  const [sortBy, setSortBy] = useState<"title" | "po">("title");
  const q = term.trim().toLowerCase();

  const orders = app.pendingOrders.filter((o) => {
    if (o.supplierId !== supplierId) return false;
    if (!q) return true;
    const rec = app.recordFor(o.recordId);
    return (
      (rec && (rec.title.toLowerCase().includes(q) || rec.artist.toLowerCase().includes(q))) ||
      (o.poNumber ?? "").toLowerCase().includes(q)
    );
  });
  const sorted = [...orders].sort((a, b) => {
    if (sortBy === "po") return (a.poNumber ?? "").localeCompare(b.poNumber ?? "");
    const ra = app.recordFor(a.recordId)?.title ?? "";
    const rb = app.recordFor(b.recordId)?.title ?? "";
    return ra.localeCompare(rb);
  });

  return (
    <div className="card">
      <div className="card-head">
        Orders
        <span className="muted xsmall">from this supplier — click one to receive it</span>
      </div>
      <div className="card-body stack">
        <div className="row wrap">
          <input
            type="text"
            placeholder="Search title or PO…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "title" | "po")}>
            <option value="title">Sort: Title</option>
            <option value="po">Sort: PO</option>
          </select>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Title</th>
              <th>PO</th>
              <th className="num">Qty</th>
              <th className="num">Expected cost</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => {
              const rec = app.recordFor(o.recordId);
              return (
                <tr key={o.id} className="row-click" onClick={() => onPick(o)}>
                  <td>{rec ? `${rec.artist} — ${rec.title}` : o.recordId}</td>
                  <td className="mono small">{o.poNumber ?? "—"}</td>
                  <td className="num">{o.qty}</td>
                  <td className="num">
                    {o.expectedListPrice != null ? money(o.expectedListPrice) : "—"}
                    {o.expectedDiscountPct ? ` (${o.expectedDiscountPct}% off)` : ""}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="muted small">
                  No pending orders from this supplier{q ? " matching that search" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReadLineRow({
  line,
  recordTitle,
  locked,
  onEdit,
  onRemove,
}: {
  line: InvoiceLine;
  recordTitle: string;
  locked: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const marginPct = line.acceptedPrice > 0 ? round2(((line.acceptedPrice - line.cost) / line.acceptedPrice) * 100) : 0;
  return (
    <tr>
      <td className="mono small">{line.scannedCode ?? "—"}</td>
      <td>{recordTitle}</td>
      <td>
        <span className="badge grade">{line.grade}</span>
      </td>
      <td className="num">{money(line.listPrice)}</td>
      <td className="num">{line.discountPct}%</td>
      <td className="num">{money(line.acceptedPrice)}</td>
      <td className="num small muted">{marginPct.toFixed(1)}%</td>
      <td className="num">{line.qty}</td>
      <td className="num">{money(line.cost * line.qty)}</td>
      <td className="num">
        {!locked && (
          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost sm" onClick={onEdit} title="Edit this line">
              ✏
            </button>
            <button className="btn ghost sm" onClick={onRemove} title="Remove this line">
              ✕
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function EditLineRow({
  invoiceId,
  line,
  mode,
  supplier,
  onDone,
}: {
  invoiceId: string;
  line: InvoiceLine;
  mode: IntakeMode;
  supplier: Supplier;
  onDone: () => void;
}) {
  const app = useApp();
  const record = app.recordFor(line.recordId);
  const [listRaw, setListRaw] = useState(String(line.listPrice));
  const [discountRaw, setDiscountRaw] = useState(String(line.discountPct));
  const [sellRaw, setSellRaw] = useState<string | null>(String(line.acceptedPrice));
  const [grade, setGrade] = useState<Grade>(line.grade);
  const [qty, setQty] = useState(line.qty);
  const [override, setOverride] = useState(false);

  const { extPrice, sellPrice, marginPct, belowCost } = useLinePricing({
    listRaw,
    discountRaw,
    sellRaw,
    autoAccept: false,
    stickyPrice: mode === "New" ? record?.stickyPrice : undefined,
    supplier,
  });

  const save = (overrideBy?: string) => {
    app.updateInvoiceLine(
      invoiceId,
      line.id,
      {
        listPrice: Number(listRaw) || 0,
        discountPct: Number(discountRaw) || 0,
        acceptedPrice: sellPrice,
        grade: mode === "New" ? line.grade : grade,
        qty: mode === "New" ? qty : line.qty,
      },
      overrideBy,
    );
    onDone();
  };

  return (
    <tr>
      <td className="mono small">{line.scannedCode ?? "—"}</td>
      <td className="small">{record ? `${record.artist} — ${record.title}` : line.recordId}</td>
      <td>
        {mode === "Second-hand" ? (
          <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        ) : (
          <span className="badge grade">{line.grade}</span>
        )}
      </td>
      <td className="num">
        <input className="inline-num" type="number" step="0.01" value={listRaw} onChange={(e) => setListRaw(e.target.value)} />
      </td>
      <td className="num">
        <input className="inline-pct" type="number" value={discountRaw} onChange={(e) => setDiscountRaw(e.target.value)} />
      </td>
      <td className="num">
        <input
          className="inline-num"
          type="number"
          step="0.01"
          value={sellRaw ?? ""}
          onChange={(e) => setSellRaw(e.target.value)}
        />
      </td>
      <td className="num small muted">{marginPct.toFixed(1)}%</td>
      <td className="num">
        {mode === "New" ? (
          <input
            className="inline-num"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          />
        ) : (
          1
        )}
      </td>
      <td className="num small muted">{money(extPrice * (mode === "New" ? qty : 1))}</td>
      <td className="num">
        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost sm" onClick={onDone}>
            Cancel
          </button>
          <button
            className={"btn sm" + (belowCost ? " danger" : " primary")}
            onClick={() => (belowCost ? setOverride(true) : save())}
          >
            {belowCost ? "⚠ Below cost" : "✓ Save"}
          </button>
        </div>
      </td>
      {override && (
        <ManagerOverride
          reason={`Accept ${money(sellPrice)} below cost ${money(extPrice)} for ${record?.artist} — ${record?.title}.`}
          onCancel={() => setOverride(false)}
          onConfirm={(by) => save(by)}
        />
      )}
    </tr>
  );
}

function NewLineRow({
  invoiceId,
  mode,
  supplier,
  autoAccept,
  prefillOrder,
  onPrefillConsumed,
  onCommitted,
}: {
  invoiceId: string;
  mode: IntakeMode;
  supplier: Supplier;
  autoAccept: boolean;
  prefillOrder: PendingOrderLine | null;
  onPrefillConsumed: () => void;
  onCommitted: (msg: string) => void;
}) {
  const app = useApp();
  const [scannedCode, setScannedCode] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [fromOrderId, setFromOrderId] = useState<string | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [listRaw, setListRaw] = useState("0.00");
  const [discountRaw, setDiscountRaw] = useState("0");
  const [sellRaw, setSellRaw] = useState<string | null>(null);
  const [grade, setGrade] = useState<Grade>(mode === "New" ? "M" : "VG");
  const [qty, setQty] = useState(1);
  const [override, setOverride] = useState(false);

  useEffect(() => {
    if (!prefillOrder) return;
    setScannedCode(prefillOrder.scannedCode ?? "");
    setRecordId(prefillOrder.recordId);
    setFromOrderId(prefillOrder.id);
    if (prefillOrder.expectedListPrice != null) setListRaw(String(prefillOrder.expectedListPrice));
    if (prefillOrder.expectedDiscountPct != null) setDiscountRaw(String(prefillOrder.expectedDiscountPct));
    setQty(prefillOrder.qty);
    onPrefillConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillOrder]);

  const record = app.recordFor(recordId ?? undefined);

  // Clearing the record has to clear everything that came WITH it — leaving
  // a stale cost/discount/sell/qty behind after "pick a different record"
  // would silently carry pricing from one title onto another.
  const clearRow = () => {
    setRecordId(null);
    setFromOrderId(null);
    setScannedCode("");
    setListRaw("0.00");
    setDiscountRaw("0");
    setSellRaw(null);
    setQty(1);
    setGrade(mode === "New" ? "M" : "VG");
  };

  const resolveCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    // Cascade: this supplier's pending orders, then the local catalog
    // (including a catalog-only Discogs match, which "search" collapses
    // into in this prototype) — no match opens Lookup, decision 24's fallback.
    const order = app.pendingOrders.find((o) => o.supplierId === supplier.id && o.scannedCode === trimmed);
    if (order) {
      setRecordId(order.recordId);
      setFromOrderId(order.id);
      if (order.expectedListPrice != null) setListRaw(String(order.expectedListPrice));
      if (order.expectedDiscountPct != null) setDiscountRaw(String(order.expectedDiscountPct));
      setQty(order.qty);
      return;
    }
    const rec = app.records.find((r) => r.manufacturerUpc === trimmed);
    if (rec) {
      setRecordId(rec.id);
      setFromOrderId(null);
      return;
    }
    setLookupOpen(true);
  };

  const { listPrice, discountPct, extPrice, suggested, sellPrice, marginPct, belowCost } = useLinePricing({
    listRaw,
    discountRaw,
    sellRaw,
    autoAccept,
    stickyPrice: mode === "New" ? record?.stickyPrice : undefined,
    supplier,
  });
  const ready = !!record && listPrice > 0 && sellPrice > 0;

  const commit = (overrideBy?: string) => {
    if (!record) return;
    app.addInvoiceLine(
      invoiceId,
      {
        recordId: record.id,
        scannedCode: scannedCode.trim() || undefined,
        listPrice,
        discountPct,
        acceptedPrice: sellPrice,
        grade: mode === "New" ? "M" : grade,
        qty: mode === "New" ? qty : 1,
        fromOrderId: fromOrderId ?? undefined,
      },
      overrideBy,
    );
    if (fromOrderId) app.receivePendingOrderLine(fromOrderId);
    const n = mode === "New" ? qty : 1;
    onCommitted(`Added ${n}× ${record.artist} — ${record.title} at ${money(sellPrice)} (cost ${money(extPrice)}).`);
  };

  return (
    <tr>
      <td>
        {!record ? (
          <div className="row">
            <input
              type="text"
              value={scannedCode}
              placeholder="Scan or type…"
              onChange={(e) => setScannedCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && resolveCode(scannedCode)}
              style={{ width: 130 }}
            />
            <button className="btn ghost sm" onClick={() => resolveCode(scannedCode)} title="Resolve">
              ↵
            </button>
            <button className="btn ghost sm" onClick={() => setLookupOpen(true)}>
              Lookup
            </button>
          </div>
        ) : (
          <span className="mono small">{scannedCode || "—"}</span>
        )}
      </td>
      <td>
        {record ? (
          <div className="row">
            <span className="small">
              {record.artist} — {record.title}
            </span>
            <button className="btn ghost sm" onClick={clearRow} title="Clear — pick a different record">
              ✕
            </button>
          </div>
        ) : (
          <span className="muted small">Not resolved yet</span>
        )}
      </td>
      <td>
        {mode === "Second-hand" ? (
          <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        ) : (
          <span className="badge grade">M</span>
        )}
      </td>
      <td className="num">
        <input className="inline-num" type="number" step="0.01" value={listRaw} onChange={(e) => setListRaw(e.target.value)} />
      </td>
      <td className="num">
        <input className="inline-pct" type="number" value={discountRaw} onChange={(e) => setDiscountRaw(e.target.value)} />
      </td>
      <td className="num">
        {autoAccept ? (
          money(sellPrice)
        ) : (
          <input
            className="inline-num"
            type="number"
            step="0.01"
            value={sellRaw ?? suggested.toFixed(2)}
            onChange={(e) => setSellRaw(e.target.value)}
          />
        )}
      </td>
      <td className="num small muted">{marginPct.toFixed(1)}%</td>
      <td className="num">
        {mode === "New" ? (
          <input
            className="inline-num"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          />
        ) : (
          1
        )}
      </td>
      <td className="num small muted">{money(extPrice * (mode === "New" ? qty : 1))}</td>
      <td className="num">
        <button
          className={"btn sm" + (belowCost ? " danger" : " primary")}
          disabled={!ready}
          onClick={() => (belowCost ? setOverride(true) : commit())}
          title={belowCost ? "Below cost — needs a manager override" : "Add this line"}
        >
          {belowCost ? "⚠" : "✓"}
        </button>
      </td>
      {lookupOpen && (
        <FindOrCreateRecordModal
          onClose={() => setLookupOpen(false)}
          onPick={(rec) => {
            setRecordId(rec.id);
            setFromOrderId(null);
            setLookupOpen(false);
          }}
        />
      )}
      {override && (
        <ManagerOverride
          reason={`Accept ${money(sellPrice)} below cost ${money(extPrice)} for ${record?.artist} — ${record?.title}.`}
          onCancel={() => setOverride(false)}
          onConfirm={(by) => commit(by)}
        />
      )}
    </tr>
  );
}

function FindOrCreateRecordModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (rec: RecordEntry) => void;
}) {
  const app = useApp();
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const q = term.trim().toLowerCase();
  const results = q
    ? app.records.filter((r) =>
        [r.artist, r.title, r.label, r.catalogNo].some((f) => f.toLowerCase().includes(q)),
      )
    : [];

  return (
    <Modal title="Find or add this title" wide onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Search the local catalog — artist, title, label, catalog no.</span>
          <input type="text" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        {results.length > 0 && (
          <table className="data">
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.artist} — {r.title}
                    {r.catalogOnly && <span className="badge warn" style={{ marginLeft: 6 }}>Discogs match</span>}
                  </td>
                  <td className="small muted">
                    {r.label} · {r.catalogNo}
                  </td>
                  <td className="num">
                    <button className="btn sm primary" onClick={() => onPick(r)}>
                      Use this
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {q && results.length === 0 && <p className="small muted">No local match.</p>}

        <div className="hr" />
        {!creating ? (
          <button className="btn" onClick={() => setCreating(true)}>
            + This title isn't in the catalog at all
          </button>
        ) : (
          <ManualEntryForm onCreate={onPick} />
        )}
      </div>
    </Modal>
  );
}

function ManualEntryForm({ onCreate }: { onCreate: (rec: RecordEntry) => void }) {
  const app = useApp();
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [catalogNo, setCatalogNo] = useState("");
  const [label, setLabel] = useState("");
  const [section, setSection] = useState<Section>("VINYL");

  const ready = artist.trim() && title.trim() && genre.trim() && catalogNo.trim() && label.trim();

  return (
    <div className="stack">
      <p className="small muted">
        No barcode, no Discogs match — capture what decision 24 asks for. Format, year, and
        country are placeholders until someone fills them in from the titlecard (E-04).
      </p>
      <div className="grid cols-2">
        <label className="field">
          <span>Artist</span>
          <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </label>
        <label className="field">
          <span>Album title</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Label</span>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field">
          <span>Catalog number</span>
          <input type="text" value={catalogNo} onChange={(e) => setCatalogNo(e.target.value)} />
        </label>
        <label className="field">
          <span>Genre</span>
          <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} />
        </label>
        <label className="field">
          <span>Section</span>
          <select value={section} onChange={(e) => setSection(e.target.value as Section)}>
            <option value="VINYL">VINYL</option>
            <option value="MERCH">MERCH</option>
          </select>
        </label>
      </div>
      <button
        className="btn primary"
        disabled={!ready}
        onClick={() => {
          const id = app.createRecordManual({
            artist: artist.trim(),
            title: title.trim(),
            genre: genre.trim(),
            catalogNo: catalogNo.trim(),
            label: label.trim(),
            section,
          });
          onCreate(app.recordFor(id)!);
        }}
      >
        Create &amp; continue
      </button>
    </div>
  );
}
