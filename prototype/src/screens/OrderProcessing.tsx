import { useEffect, useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { SeparatorSelect } from "../components/SeparatorSelect";
import { TitlecardPanel } from "../components/TitlecardPanel";
import type { PendingOrderLine, Supplier } from "../data/types";
import { money } from "../lib/money";
import { orderReady, separatorCounts } from "../lib/totals";
import { useApp } from "../store/AppStore";

// Order Processing (M-02 Phase 2) — a Manager turns Employee-raised pending
// order lines (Phase 1, raised from a titlecard's Order button) into
// PurchaseOrders.
interface Stream {
  supplier: Supplier;
  separator?: string;
  lines: PendingOrderLine[];
}

const streamKey = (supplierId: string, separator: string | undefined) => `${supplierId}::${separator ?? ""}`;

const daysAgo = (at: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(at.replace(" ", "T")).getTime()) / 86400000));

function streamMath(lines: PendingOrderLine[], supplier: Supplier) {
  const unitCount = lines.reduce((n, l) => n + l.qty, 0);
  const sellTotal = lines.reduce((n, l) => n + l.sellPrice * l.qty, 0);
  // "Estimated cost | Sell total less the supplier's discount" — M-02 step 4 table.
  const estCost = sellTotal * (1 - supplier.discountPct / 100);
  const customerCount = lines.filter((l) => l.customerId).length;
  const oldestAt = lines.length ? lines.reduce((min, l) => (l.createdAt < min ? l.createdAt : min), lines[0].createdAt) : "";
  const ready = orderReady(supplier, unitCount, sellTotal, estCost);
  return { unitCount, sellTotal, estCost, customerCount, oldestAt, ready };
}

// "An order is 'ready to place' once it hits minOrderQty. If that's 0,
// readiness falls back to minOrderAmount instead" — Supplier.minOrderQty doc
// comment; same wording used on the Suppliers screen.
function minimumLabel(supplier: Supplier): string {
  if (supplier.minOrderQty > 0) return `${supplier.minOrderQty} units`;
  if (supplier.minOrderAmount > 0) return `${money(supplier.minOrderAmount)} (${supplier.minOrderAmountBasis})`;
  return "none configured";
}

export function OrderProcessing() {
  const app = useApp();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [processing, setProcessing] = useState<Stream | null>(null);
  const [viewing, setViewing] = useState<{ supplierId: string; separator?: string; poNumber?: string } | null>(null);
  const [streamMerge, setStreamMerge] = useState<{ stream: Stream; nextSeparator: string | undefined; targetCount: number } | null>(
    null,
  );

  const q = supplierQuery.trim().toLowerCase();
  const matchesQuery = (supplier?: Supplier) =>
    !!supplier && (!q || supplier.name.toLowerCase().includes(q) || supplier.shortName.toLowerCase().includes(q));

  const pendingStreams = useMemo(() => {
    const map = new Map<string, Stream>();
    for (const line of app.pendingOrders) {
      if (line.poNumber) continue;
      const supplier = app.supplierFor(line.supplierId);
      if (!matchesQuery(supplier)) continue;
      const key = streamKey(line.supplierId, line.separator);
      let stream = map.get(key);
      if (!stream) {
        stream = { supplier: supplier!, separator: line.separator, lines: [] };
        map.set(key, stream);
      }
      stream.lines.push(line);
    }
    return [...map.values()].sort(
      (a, b) => a.supplier.name.localeCompare(b.supplier.name) || (a.separator ?? "").localeCompare(b.separator ?? ""),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.pendingOrders, app.suppliers, q]);

  const placedStreams = useMemo(() => {
    const map = new Map<string, Stream & { poNumber: string; placedAt: string }>();
    for (const line of app.pendingOrders) {
      if (!line.poNumber) continue;
      const supplier = app.supplierFor(line.supplierId);
      if (!matchesQuery(supplier)) continue;
      const key = `${streamKey(line.supplierId, line.separator)}::${line.poNumber}`;
      let stream = map.get(key);
      if (!stream) {
        stream = {
          supplier: supplier!,
          separator: line.separator,
          lines: [],
          poNumber: line.poNumber,
          placedAt: line.placedAt ?? line.createdAt,
        };
        map.set(key, stream);
      }
      stream.lines.push(line);
    }
    return [...map.values()].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.pendingOrders, app.suppliers, q]);

  // Mass-shift a whole pending stream onto a different separator — same
  // merge-on-conflict rule as retargeting one line from View (decision 17),
  // just applied to every line in the stream at once.
  const requestStreamSeparatorChange = (stream: Stream, nextRaw: string | undefined) => {
    const nextKey = nextRaw ?? "";
    if (nextKey === (stream.separator ?? "")) return;
    const existing = separatorCounts(app.pendingOrders, stream.supplier.id).get(nextKey) ?? 0;
    if (existing > 0) {
      setStreamMerge({ stream, nextSeparator: nextRaw, targetCount: existing });
    } else {
      const res = app.retargetStreamSeparator(stream.supplier.id, stream.separator, nextRaw);
      if (res) {
        setStatusMsg(
          `Moved ${res.movedCount} line${res.movedCount === 1 ? "" : "s"} to ${nextRaw ? `separator ${nextRaw}` : "the no-separator pile"} for ${stream.supplier.name}.`,
        );
      }
    }
  };

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">M-02</span>
        <div>
          <h1>Order Processing</h1>
          <p className="sub">
            One line per Supplier + separator, showing pending total, age of the oldest line, order
            method, customer-attached count, sell total, and estimated cost. Employees raise pending
            lines from a titlecard's <strong>Order</strong> button (Phase 1); a Manager{" "}
            <strong>Process</strong>es a stream into a PurchaseOrder here (Phase 2). Tracking what's
            already on order — Phase 3 — isn't built yet.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body">
          <input
            type="search"
            value={supplierQuery}
            onChange={(e) => setSupplierQuery(e.target.value)}
            placeholder="Filter by supplier name or short code…"
          />
        </div>
      </div>

      {statusMsg && (
        <div className="callout ok" style={{ marginBottom: "var(--sp-4)" }}>
          {statusMsg}
        </div>
      )}

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-head">Pending — not yet placed</div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Sep</th>
                <th className="num">Pending</th>
                <th className="num">Oldest</th>
                <th>Order via</th>
                <th className="num">Cust.-attached</th>
                <th className="num">Sell total</th>
                <th className="num">Est. cost</th>
                <th>Ready</th>
                <th>PO</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendingStreams.map((stream) => {
                const m = streamMath(stream.lines, stream.supplier);
                return (
                  <tr
                    key={streamKey(stream.supplier.id, stream.separator)}
                    className="row-click"
                    onClick={() => setViewing({ supplierId: stream.supplier.id, separator: stream.separator })}
                  >
                    <td>
                      {stream.supplier.name} <span className="mono xsmall muted">({stream.supplier.shortName})</span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <SeparatorSelect
                        value={stream.separator ?? ""}
                        knownSeparators={[...separatorCounts(app.pendingOrders, stream.supplier.id).keys()].filter((k) => k !== "")}
                        onChange={(next) => requestStreamSeparatorChange(stream, next)}
                      />
                    </td>
                    <td className="num">{stream.lines.length}</td>
                    <td className="num">{daysAgo(m.oldestAt)}d</td>
                    <td className="small">{stream.supplier.orderVia}</td>
                    <td className="num">{m.customerCount}</td>
                    <td className="num">{money(m.sellTotal)}</td>
                    <td className="num">{money(m.estCost)}</td>
                    <td>
                      {m.ready ? <span className="badge ok">Ready</span> : <span className="badge warn">Not yet</span>}
                    </td>
                    <td className="muted small">—</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm primary" onClick={() => setProcessing(stream)}>
                        Process
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pendingStreams.length === 0 && (
                <tr>
                  <td colSpan={11} className="small muted">
                    No pending order lines{q ? ` matching "${supplierQuery}"` : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Previously placed — most recent first</div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>PO</th>
                <th>Supplier</th>
                <th>Sep</th>
                <th className="num">Lines</th>
                <th>Placed</th>
                <th>Order via</th>
                <th className="num">Cust.-attached</th>
                <th className="num">Sell total</th>
                <th className="num">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {placedStreams.map((stream) => {
                const m = streamMath(stream.lines, stream.supplier);
                return (
                  <tr
                    key={`${streamKey(stream.supplier.id, stream.separator)}::${stream.poNumber}`}
                    className="row-click"
                    onClick={() =>
                      setViewing({ supplierId: stream.supplier.id, separator: stream.separator, poNumber: stream.poNumber })
                    }
                  >
                    <td className="mono small">{stream.poNumber}</td>
                    <td>
                      {stream.supplier.name} <span className="mono xsmall muted">({stream.supplier.shortName})</span>
                    </td>
                    <td>
                      {stream.separator ? <span className="badge">{stream.separator}</span> : <span className="muted">—</span>}
                    </td>
                    <td className="num">{stream.lines.length}</td>
                    <td className="small">{stream.placedAt}</td>
                    <td className="small">{stream.supplier.orderVia}</td>
                    <td className="num">{m.customerCount}</td>
                    <td className="num">{money(m.sellTotal)}</td>
                    <td className="num">{money(m.estCost)}</td>
                  </tr>
                );
              })}
              {placedStreams.length === 0 && (
                <tr>
                  <td colSpan={9} className="small muted">
                    No PurchaseOrders placed yet{q ? ` matching "${supplierQuery}"` : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {processing && (
        <ProcessModal
          stream={processing}
          onClose={() => setProcessing(null)}
          onDone={(msg) => {
            setProcessing(null);
            setStatusMsg(msg);
          }}
        />
      )}

      {viewing && (
        <ViewOrderModal
          supplierId={viewing.supplierId}
          separator={viewing.separator}
          poNumber={viewing.poNumber}
          onClose={() => setViewing(null)}
          onStatus={setStatusMsg}
        />
      )}

      {streamMerge && (
        <Modal
          title="Merge streams?"
          onClose={() => setStreamMerge(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setStreamMerge(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const res = app.retargetStreamSeparator(
                    streamMerge.stream.supplier.id,
                    streamMerge.stream.separator,
                    streamMerge.nextSeparator,
                  );
                  setStreamMerge(null);
                  if (res) {
                    setStatusMsg(
                      `Merged ${res.movedCount} line${res.movedCount === 1 ? "" : "s"} into ${streamMerge.nextSeparator ? `separator ${streamMerge.nextSeparator}` : "the no-separator pile"} for ${streamMerge.stream.supplier.name}.`,
                    );
                  }
                }}
              >
                Merge
              </button>
            </>
          }
        >
          <div className="callout danger">
            {streamMerge.nextSeparator ? `Separator ${streamMerge.nextSeparator}` : "The no-separator pile"} already has{" "}
            {streamMerge.targetCount} pending line{streamMerge.targetCount === 1 ? "" : "s"} for{" "}
            {streamMerge.stream.supplier.name}. Moving these {streamMerge.stream.lines.length} line
            {streamMerge.stream.lines.length === 1 ? "" : "s"} there merges the two streams —{" "}
            <strong>this can't be undone.</strong>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProcessModal({ stream, onClose, onDone }: { stream: Stream; onClose: () => void; onDone: (msg: string) => void }) {
  const app = useApp();
  const [raw, setRaw] = useState("");
  const supplier = stream.supplier;
  const m = streamMath(stream.lines, supplier);
  const trimmed = raw.trim();
  const taken = trimmed !== "" && app.poNumberTaken(trimmed);
  const nextDefault = String(app.nextPoNumber);
  const viaEmail = supplier.orderVia === "Email";
  const cancelBy = supplier.cancelByDays
    ? new Date(Date.now() + supplier.cancelByDays * 86400000).toLocaleDateString("en-CA")
    : undefined;

  const commit = () => {
    const res = app.processOrderStream(supplier.id, stream.separator, trimmed || undefined);
    if (!res) return;
    onDone(
      res.emailed
        ? `PO ${res.poNumber} emailed to ${supplier.email} — ${res.lineCount} line${res.lineCount === 1 ? "" : "s"}, ${res.unitCount} units.`
        : `PO ${res.poNumber} marked placed via ${supplier.orderVia} — printable order document produced; a person still has to send it.`,
    );
  };

  return (
    <Modal
      title={`Process — ${supplier.name}${stream.separator ? ` (sep ${stream.separator})` : ""}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={taken} onClick={commit}>
            {viaEmail ? "Send order" : "Mark placed"}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Sends via <strong>{supplier.orderVia}</strong> —{" "}
          {viaEmail
            ? "composes and sends the order to the supplier's address, stating items, quantities, cancel-by date, and backorder policy."
            : "produces a printable order document for a Manager to act on manually; marking placed here does not tell the supplier."}{" "}
          <em>(M-02 step 6.)</em>
        </p>

        {viaEmail ? (
          <div className="card">
            <div className="card-head">Email preview</div>
            <div className="card-body small stack">
              <div>
                To: <span className="mono">{supplier.email}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                {stream.lines.map((l) => {
                  const rec = app.recordFor(l.recordId);
                  return (
                    <li key={l.id}>
                      {l.qty}× {rec ? `${rec.artist} — ${rec.title}` : l.recordId}
                    </li>
                  );
                })}
              </ul>
              <div>Cancel by: {cancelBy ?? "— (no default configured for this supplier)"}</div>
              <div>Backorders: {supplier.backordersAllowed ? "allowed" : "not allowed"}</div>
            </div>
          </div>
        ) : (
          <div className="callout">
            {stream.lines.length} line{stream.lines.length === 1 ? "" : "s"}, {m.unitCount} units, sell{" "}
            {money(m.sellTotal)}. Use <strong>View</strong> first to double-check each title's supplier on its
            titlecard.
          </div>
        )}

        <label className="field">
          <span>PO number — blank auto-assigns the next unused ascending number ({nextDefault}); editable</span>
          <input type="text" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={nextDefault} />
        </label>
        {taken && <div className="callout danger">PO number already in use — pick another.</div>}
      </div>
    </Modal>
  );
}

function ViewOrderModal({
  supplierId,
  separator,
  poNumber,
  onClose,
  onStatus,
}: {
  supplierId: string;
  separator?: string;
  poNumber?: string;
  onClose: () => void;
  onStatus: (msg: string) => void;
}) {
  const app = useApp();
  const supplier = app.supplierFor(supplierId);
  const editable = !poNumber;
  const sepKey = separator ?? "";

  // Live, not a snapshot — qty/price/separator edits and deletes below need
  // the line list (and the titlecard selection) to track the store.
  const lines = useMemo(
    () =>
      app.pendingOrders.filter(
        (o) => o.supplierId === supplierId && (o.separator ?? "") === sepKey && (editable ? !o.poNumber : o.poNumber === poNumber),
      ),
    [app.pendingOrders, supplierId, sepKey, editable, poNumber],
  );

  // Drives both this modal's per-line Sep dropdown options and the merge check.
  const sepCounts = useMemo(() => separatorCounts(app.pendingOrders, supplierId), [app.pendingOrders, supplierId]);

  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(lines[0]?.recordId ?? null);
  const [showCost, setShowCost] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PendingOrderLine | null>(null);
  const [mergeRequest, setMergeRequest] = useState<{ line: PendingOrderLine; nextSeparator: string | undefined } | null>(null);

  useEffect(() => {
    if (!lines.some((l) => l.recordId === selectedRecordId)) {
      setSelectedRecordId(lines[0]?.recordId ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  if (!supplier) return null;
  const m = streamMath(lines, supplier);
  const placedAt = !editable ? lines[0]?.placedAt : undefined;

  const requestSeparatorChange = (line: PendingOrderLine, nextRaw: string | undefined) => {
    const nextKey = nextRaw ?? "";
    if (nextKey === sepKey) return; // no-op — dropdown re-selected the current stream
    const existing = sepCounts.get(nextKey) ?? 0;
    if (existing > 0) {
      setMergeRequest({ line, nextSeparator: nextRaw });
    } else {
      app.updatePendingOrderLine(line.id, { separator: nextRaw });
      onStatus(`Moved to a new stream (sep ${nextRaw ?? "none"}) — nothing else there yet.`);
    }
  };

  const knownSeparators = [...sepCounts.keys()].filter((k) => k !== "").sort();

  return (
    <Modal
      title={`${poNumber ? `PO ${poNumber} — ` : "Pending order — "}${supplier.name}${separator ? ` (sep ${separator})` : ""}`}
      onClose={onClose}
      wide
      foot={
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="stack">
        <div className="card">
          <div className="card-head">Meeting the minimum</div>
          <div className="card-body small">
            <div className="totals-row">
              <span>Supplier requires</span>
              <strong>{minimumLabel(supplier)}</strong>
            </div>
            <div className="totals-row">
              <span>Qty (units)</span>
              <span className="num">
                {m.unitCount}
                {supplier.minOrderQty > 0 && <span className="muted"> / {supplier.minOrderQty}</span>}
              </span>
            </div>
            <div className="totals-row">
              <span>Retail value (sell total)</span>
              <span className="num">
                {money(m.sellTotal)}
                {supplier.minOrderAmount > 0 && supplier.minOrderAmountBasis === "Retail" && (
                  <span className="muted"> / {money(supplier.minOrderAmount)}</span>
                )}
              </span>
            </div>
            <div className="totals-row">
              <span>Cost (est.)</span>
              <span className="num">
                {money(m.estCost)}
                {supplier.minOrderAmount > 0 && supplier.minOrderAmountBasis === "Net" && (
                  <span className="muted"> / {money(supplier.minOrderAmount)}</span>
                )}
              </span>
            </div>
            {m.ready ? (
              <div className="callout ok small" style={{ marginTop: "var(--sp-2)" }}>
                Ready to place.
              </div>
            ) : (
              <div className="callout small" style={{ marginTop: "var(--sp-2)" }}>
                Not yet ready — below the supplier's minimum.
              </div>
            )}
          </div>
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Sell price</th>
              {editable && <th>Sep</th>}
              <th className="num">Age</th>
              <th>Customer</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const rec = app.recordFor(l.recordId);
              const cust = app.customerFor(l.customerId);
              return (
                <tr
                  key={l.id}
                  className={"row-click" + (l.recordId === selectedRecordId ? " selected" : "")}
                  onClick={() => setSelectedRecordId(l.recordId)}
                >
                  <td>{rec ? `${rec.artist} — ${rec.title}` : l.recordId}</td>
                  <td className="num" onClick={(e) => editable && e.stopPropagation()}>
                    {editable ? (
                      <input
                        className="inline-num"
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => app.updatePendingOrderLine(l.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ width: 56 }}
                      />
                    ) : (
                      l.qty
                    )}
                  </td>
                  <td className="num" onClick={(e) => editable && e.stopPropagation()}>
                    {editable ? (
                      <input
                        className="inline-num"
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.sellPrice}
                        onChange={(e) => app.updatePendingOrderLine(l.id, { sellPrice: Math.max(0, Number(e.target.value) || 0) })}
                        style={{ width: 72 }}
                      />
                    ) : (
                      money(l.sellPrice)
                    )}
                  </td>
                  {editable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <SeparatorSelect
                        value={l.separator ?? ""}
                        knownSeparators={knownSeparators}
                        onChange={(next) => requestSeparatorChange(l, next)}
                      />
                    </td>
                  )}
                  <td className="num">{daysAgo(l.createdAt)}d</td>
                  <td className="small">{cust ? cust.name : "—"}</td>
                  {editable && (
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm danger" onClick={() => setDeleteTarget(l)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={editable ? 7 : 5} className="small muted">
                  No lines left in this stream.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {placedAt && <p className="xsmall muted">Placed {placedAt}.</p>}

        {selectedRecordId && (
          <div className="card">
            <div className="card-head">
              Titlecard — click a row above to switch, and double-check the supplier before sending
              <span className="flow-id" style={{ marginTop: 0 }}>
                E-04
              </span>
            </div>
            <div className="card-body">
              <TitlecardPanel
                recordId={selectedRecordId}
                onStatus={() => {}}
                showCost={showCost}
                onToggleShowCost={() => setShowCost((v) => !v)}
              />
            </div>
          </div>
        )}
      </div>

      {mergeRequest && (
        <Modal
          title="Merge into existing stream?"
          onClose={() => setMergeRequest(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setMergeRequest(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  app.updatePendingOrderLine(mergeRequest.line.id, { separator: mergeRequest.nextSeparator });
                  onStatus(
                    `Merged into ${mergeRequest.nextSeparator ? `separator ${mergeRequest.nextSeparator}` : "the no-separator pile"} for ${supplier.name}.`,
                  );
                  setMergeRequest(null);
                }}
              >
                Merge
              </button>
            </>
          }
        >
          <div className="callout danger">
            {mergeRequest.nextSeparator ? `Separator ${mergeRequest.nextSeparator}` : "The no-separator pile"} already has{" "}
            {sepCounts.get(mergeRequest.nextSeparator ?? "") ?? 0} pending line
            {(sepCounts.get(mergeRequest.nextSeparator ?? "") ?? 0) === 1 ? "" : "s"} for {supplier.name}. Moving this
            line there merges it into that stream — <strong>this can't be undone.</strong>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete pending order line?"
          onClose={() => setDeleteTarget(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const rec = app.recordFor(deleteTarget.recordId);
                  const res = app.deletePendingOrderLine(deleteTarget.id);
                  setDeleteTarget(null);
                  if (res) onStatus(`Deleted ${rec ? `${rec.artist} — ${rec.title}` : "the line"} from the order.`);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <div className="callout danger">
            Removes {deleteTarget.qty}× {app.recordFor(deleteTarget.recordId)?.title ?? deleteTarget.recordId} from this
            order — a plain confirmation, per M-02 decision 9.
            {deleteTarget.customerId && (
              <>
                {" "}
                <strong>
                  {app.customerFor(deleteTarget.customerId)?.name ?? "A customer"} is attached to this line — they'll need
                  to be told.
                </strong>
              </>
            )}
          </div>
        </Modal>
      )}
    </Modal>
  );
}
