import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { ReceiveReconcile } from "../components/ReceiveReconcile";
import { OutstandingPanel } from "../components/OutstandingPanel";
import { ReceiveSlab } from "../components/ReceiveSlab";
import { TitlecardPanel } from "../components/TitlecardPanel";
import {
  GRADES,
  type Grade,
  type IntakeMode,
  type Invoice,
  type InvoiceLine,
  type PendingOrderLine,
  type RecordEntry,
  type Section,
  type Supplier,
} from "../data/types";
import { money, roundUpShelf } from "../lib/money";
import { countField, figureField, integerOnly, numericOnly } from "../lib/fields";
import { round2 } from "../lib/totals";
import { useApp } from "../store/AppStore";

// E-02 Receiving, on the till's three-track frame (d38): the worklist slab you
// pick from, the Invoice, and the reconcile figures. The frame is pinned to the
// viewport and each track scrolls on its own, so the scan field and the check
// step 18 turns on are always where they were last time.
//
// The selected Invoice is carried in the URL (/receiving/:invoiceId) so it is
// deep-linkable and survives a reload — the same reason Find carries its
// Record there.

// Per till, not per employee: this is the machine at the receiving desk, the
// same way the till rail's own open/shut state already is.
const SLAB_KEY = "waxworks.receive.slab";

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    /* private window, or site data blocked — the slab just forgets */
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing to do — forgetting is an acceptable outcome here */
  }
}

export function Receiving() {
  const app = useApp();
  const nav = useNavigate();
  const { invoiceId } = useParams();

  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [term, setTerm] = useState("");
  const [prefillOrder, setPrefillOrder] = useState<PendingOrderLine | null>(null);
  // Open on arrival: receiving begins by picking what you are receiving
  // against. Used mode gets no different default — an intake with no PO behind
  // it still wants New intake and the drafts in flight where it expects them.
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));

  useEffect(() => writeStored(SLAB_KEY, slabOpen), [slabOpen]);

  const drafts = app.invoices.filter((iv) => iv.status === "Draft");
  const recent = useMemo(
    () =>
      [...app.invoices]
        .filter((iv) => iv.status !== "Draft")
        .sort((a, b) => (b.finalizedAt ?? b.createdAt).localeCompare(a.finalizedAt ?? a.createdAt))
        .slice(0, 3),
    [app.invoices],
  );

  // Invoice search (d36, d43): supplier, number, date, title, barcode, PO.
  // Title and barcode reach through the lines — "which invoices took that copy
  // in" is the question only the Invoice side can answer. Null when the box is
  // empty, which is what lets the slab show its bands instead.
  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return null;
    const hit = (iv: Invoice) => {
      const sup = app.supplierFor(iv.supplierId);
      if (
        iv.invoiceNumber.toLowerCase().includes(q) ||
        sup?.name.toLowerCase().includes(q) ||
        sup?.shortName.toLowerCase().includes(q) ||
        iv.invoiceDate.includes(q) ||
        iv.receivedDate.includes(q)
      ) {
        return true;
      }
      return iv.lines.some((l) => {
        const rec = app.recordFor(l.recordId);
        return (
          (l.scannedCode ?? "").toLowerCase().includes(q) ||
          rec?.title.toLowerCase().includes(q) ||
          rec?.artist.toLowerCase().includes(q) ||
          rec?.catalogNo.toLowerCase().includes(q) ||
          (rec?.manufacturerUpc ?? "").includes(q) ||
          // d28 lets one Invoice span several POs, and the link lives on the
          // line — so "which invoice did PO-1142 arrive on" is answered here.
          // The snapshot first: receiving a PO line consumes it, so the live
          // lookup only answers for a line whose order is somehow still open.
          (l.poNumber ?? app.pendingOrders.find((o) => o.id === l.fromOrderId)?.poNumber ?? "")
            .toLowerCase()
            .includes(q)
        );
      });
    };
    return [...app.invoices]
      .filter(hit)
      .sort((a, b) => (b.finalizedAt ?? b.createdAt).localeCompare(a.finalizedAt ?? a.createdAt));
  }, [term, app.invoices, app.records, app.suppliers, app.pendingOrders]);

  // A URL invoiceId always wins; without one, the oldest open draft stands in,
  // then the most recent finished intake. Picking anything puts it in the URL
  // and it stops moving.
  const selectedId = invoiceId ?? drafts[0]?.id ?? recent[0]?.id;
  const selected = app.invoiceFor(selectedId);

  const select = (id: string) => nav(`/receiving/${id}`, { replace: true });

  return (
    <div className={"recv-frame" + (slabOpen ? "" : " slab-shut")}>
      <ReceiveSlab
        open={slabOpen}
        onOpenChange={setSlabOpen}
        term={term}
        onTermChange={setTerm}
        drafts={drafts}
        recent={recent}
        matches={matches}
        selectedId={selected?.id}
        onSelect={select}
        onNewIntake={() => setCreating(true)}
        onOpenExisting={() => setOpening(true)}
      />

      {selected ? (
        <InvoiceEditor
          key={selected.id}
          invoiceId={selected.id}
          prefillOrder={prefillOrder}
          onPrefillConsumed={() => setPrefillOrder(null)}
        />
      ) : (
        <div className="recv-noinvoice">
          <div className="stack">
            <div className="lab">Nothing open</div>
            <p className="muted">
              Start an intake here, or pick a draft up from the worklist. A cold invoice with no
              PO behind it is fully supported.
            </p>
            <button className="btn primary" onClick={() => setCreating(true)}>
              + New intake
            </button>
          </div>
        </div>
      )}

      {creating && (
        <NewInvoiceModal onClose={() => setCreating(false)} onCreated={(id) => select(id)} />
      )}
      {opening && (
        <OpenExistingModal
          onClose={() => setOpening(false)}
          onPick={(id) => {
            select(id);
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

  const numKey = invoiceNumber.trim().toLowerCase();
  const collision = numKey
    ? app.invoices.find(
        (iv) => iv.supplierId === supplierId && iv.invoiceNumber.trim().toLowerCase() === numKey,
      )
    : undefined;
  const [proceedAnyway, setProceedAnyway] = useState(false);

  const canSubmit = supplierId && receivedDate.trim() && (!collision || proceedAnyway);

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
                onChange={() => {
                  setMode("Second-hand");
                  const def = app.suppliers.find((s) => s.defaultForSecondHand);
                  if (def) setSupplierId(def.id);
                }}
              />
              <span>Second-hand — grade required per copy, no sticky price</span>
            </label>
          </div>
        </label>

        <label className="field">
          <span>
            Supplier — any Supplier can carry a second-hand invoice, this just suggests one
            first (decision 27)
          </span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {app.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.shortName})
                {s.defaultForSecondHand ? " — default for second-hand" : ` — ${s.discountPct}% discount`}
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
            placeholder="e.g. 55099 — leave blank to auto-generate a reference"
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

        <div className="grid cols-3">
          <label className="field">
            <span>Stated subtotal (from paperwork)</span>
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

// Pricing shared by the fillable and edit rows. "List price" in this UI is
// the pre-discount figure off the paperwork; "cost" (E-02 decision 7 — the
// post-discount Ext. Price) is derived here and shown small, not typed.
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
  const suggested = opts.stickyPrice ?? roundUpShelf(listPrice * (1 + opts.supplier.discountPct / 100));
  const sellPrice = opts.autoAccept ? suggested : Number(opts.sellRaw ?? suggested.toFixed(2)) || 0;
  const marginPct = sellPrice > 0 ? round2(((sellPrice - extPrice) / sellPrice) * 100) : 0;
  const belowCost = sellPrice > 0 && sellPrice < extPrice;
  return { listPrice, discountPct, extPrice, suggested, sellPrice, marginPct, belowCost };
}

function InvoiceEditor({
  invoiceId,
  prefillOrder,
  onPrefillConsumed,
}: {
  invoiceId: string;
  prefillOrder: PendingOrderLine | null;
  onPrefillConsumed: () => void;
}) {
  // A line picked out of the worklist stages the same way a scan does — one
  // path into the staging card, so picking and scanning cannot drift apart.
  const [stagedOrder, setStagedOrder] = useState<PendingOrderLine | null>(null);
  const app = useApp();
  const invoice = app.invoiceFor(invoiceId)!;
  const supplier = app.supplierFor(invoice.supplierId)!;

  const [autoAccept, setAutoAccept] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const [removing, setRemoving] = useState<InvoiceLine | null>(null);
  // The titlecard is a view, not a route (E-04 d1) — here it is a modal over
  // the invoice rather than a fourth track, because you open it to check one
  // thing and go straight back to the line you were on.
  const [titlecardFor, setTitlecardFor] = useState<string | null>(null);

  // Finalize is about stock, not paperwork — it mints sellable InventoryItems
  // but leaves the Invoice open for correction. Only Paid actually locks it
  // (d40), which is why the scan slab survives Finalized and goes at Paid.
  const locked = invoice.status === "Paid";

  const derivedSubtotal = round2(invoice.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
  const mismatch = Math.abs(derivedSubtotal - invoice.statedSubtotal) > 0.01;
  const computedTotal = round2(derivedSubtotal + invoice.tax + invoice.freight + invoice.misc);
  const [totalOverrideRaw, setTotalOverrideRaw] = useState<string | null>(null);
  const totalRaw = totalOverrideRaw ?? computedTotal.toFixed(2);
  const enteredTotal = Number(totalRaw) || 0;
  const delta = round2(enteredTotal - computedTotal);
  const pctDelta = computedTotal !== 0 ? Math.abs(delta) / computedTotal : Math.abs(delta) > 0 ? 1 : 0;
  const beyondTolerance = Math.abs(delta) > 0.005 && pctDelta > 0.02;
  // Informational only — a shipment-level "did this pay off" estimate against
  // the full cash outlay (tax/freight/misc included), not a formal COGS
  // figure. Per-item cost/margin is unaffected — see Cost treatment.
  const expectedSellValue = round2(invoice.lines.reduce((sum, l) => sum + l.acceptedPrice * l.qty, 0));
  const expectedMarginPct =
    expectedSellValue > 0 ? round2(((expectedSellValue - enteredTotal) / expectedSellValue) * 100) : 0;
  const belowCostLines = invoice.lines.filter((l) => l.acceptedPrice < l.cost).length;
  const [finalizedCount, setFinalizedCount] = useState<number | null>(null);

  // Confirmations are events, not state: they say something just happened and
  // then stop being true. One channel, cleared on its own so nobody has to
  // dismiss a message about a label that printed six scans ago.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const doFinalize = () => {
    if (delta !== 0) app.setInvoiceTotalOverride(invoiceId, enteredTotal);
    const res = app.finalizeInvoice(invoiceId);
    if (res) setFinalizedCount(res.itemCount);
  };

  const doSaveUpdates = () => {
    if (delta !== 0) app.setInvoiceTotalOverride(invoiceId, enteredTotal);
    setToast("Totals saved.");
  };

  const mintedCount = invoice.lines.reduce((sum, l) => sum + (l.itemIds?.length ?? 0), 0);
  const printAllLabels = () =>
    setToast(
      `${mintedCount} label${mintedCount === 1 ? "" : "s"} would print here (stub) — hooked up down the line.`,
    );

  const latestLog = invoice.log[invoice.log.length - 1];

  return (
    <>
      <section className="recv-main">
        <div className="recv-head">
          <span className="recv-head-label">
            {supplier.shortName} · {invoice.invoiceNumber}
          </span>
          <span className={"badge" + (invoice.status === "Draft" ? "" : " ok")}>{invoice.status}</span>
          <span className="badge">{invoice.intakeMode}</span>
          {/* Step 13 — available at any point, but meaningless once nothing
              more will be priced. */}
          {!locked && (
            <label className="row right xsmall" style={{ gap: "var(--sp-2)" }}>
              <input
                type="checkbox"
                checked={autoAccept}
                onChange={(e) => setAutoAccept(e.target.checked)}
              />
              <span>Auto-accept suggested price</span>
            </label>
          )}
        </div>

        <div className="recv-meta">
          <span>{supplier.name}</span>
          <span className="muted">·</span>
          <span>
            dated <span className="mono">{invoice.invoiceDate || "—"}</span>
          </span>
          <span className="muted">·</span>
          <span>
            received <span className="mono">{invoice.receivedDate}</span>
          </span>
          <span className="muted">·</span>
          <span>
            supplier discount <span className="mono">{supplier.discountPct}%</span> — drives
            suggested retail (M-01)
          </span>
        </div>

        {/* The scan slab is the biggest thing on the track because Phase 2 is
            what receiving actually is. It survives Finalize (d40): a cost gets
            fixed, a carton turns up late. Only Paid removes it — and then it is
            REPLACED, not deleted, so the track keeps its shape and the absence
            explains itself. */}
        {/* The worklist, scoped to this Invoice's Supplier (d42). Above the
            scan slab because it is what you consult BEFORE scanning — what is
            expected, and afterwards what never turned up. */}
        {!locked && (
          <OutstandingPanel invoice={invoice} supplier={supplier} onPick={setStagedOrder} />
        )}

        {locked ? (
          <div className="recv-scan">
            <div className="recv-locked">
              <span className="lab">Locked</span>
              <div className="recv-locked-text">
                Paid {invoice.paidAt ?? ""} {invoice.paidBy ? `by ${invoice.paidBy}` : ""} — this
                Invoice is immutable. Amendments are manager-only, appended against the original in{" "}
                <strong>E-04</strong> (d40).
              </div>
            </div>
          </div>
        ) : (
          <StageCard
            key={stageKey}
            invoiceId={invoiceId}
            mode={invoice.intakeMode}
            supplier={supplier}
            autoAccept={autoAccept}
            finalized={invoice.status === "Finalized"}
            prefillOrder={stagedOrder ?? prefillOrder}
            onPrefillConsumed={() => {
              setStagedOrder(null);
              onPrefillConsumed();
            }}
            onCommitted={(msg) => {
              setToast(msg);
              setStageKey((k) => k + 1);
            }}
          />
        )}

        <div className="recv-lines">
          <table className="data">
            <thead>
              <tr>
                <th />
                <th>Record</th>
                <th>Grade</th>
                {/* A column per figure. Short headings, because a two-word
                    heading sets its column's minimum all the way down and
                    these columns are pinned narrow so Record takes only what
                    is left. */}
                <th className="num">List</th>
                <th className="num">Disc%</th>
                <th className="num">Sell</th>
                <th className="num">Margin</th>
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
                    onRemove={() => setRemoving(l)}
                    onOpenTitlecard={() => setTitlecardFor(l.recordId)}
                  />
                ) : (
                  <ReadLineRow
                    key={l.id}
                    line={l}
                    record={app.recordFor(l.recordId)}
                    locked={locked}
                    onEdit={() => setEditingLineId(l.id)}
                    onPrintLabel={() => {
                      const n = l.itemIds?.length ?? 0;
                      setToast(
                        `${n} label${n === 1 ? "" : "s"} would print here (stub) — hooked up down the line.`,
                      );
                    }}
                    onRemove={() => setRemoving(l)}
                    onOpenTitlecard={() => setTitlecardFor(l.recordId)}
                  />
                ),
              )}
              {invoice.lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted small">
                    No lines yet — scan a barcode above, or pick something off the worklist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <details className="till-log">
          <summary>
            <span className="till-log-top">
              <span className="lab">Log &amp; notes ({invoice.log.length})</span>
              <span className="till-log-chev" aria-hidden="true">
                ▾
              </span>
            </span>
            {latestLog && (
              <span className="till-log-latest">
                <time className="mono">{latestLog.at.slice(11, 16)}</time>
                <span>{latestLog.text}</span>
              </span>
            )}
          </summary>
          <div className="xsmall muted stack" style={{ margin: "var(--sp-3) 0" }}>
            {[...invoice.log].reverse().map((e, i) => (
              <div key={i}>
                <span className="mono">{e.at}</span> — {e.text}
              </div>
            ))}
          </div>
        </details>

        {/* Events fade; STATES stay put. The discrepancy warning used to sit
            here as a callout and is a state — it lives in the reconcile
            verdict strip, which says the same thing and does not push the
            line table down to say it. */}
        {toast && (
          <div className="recv-toast" role="status">
            <span>{toast}</span>
            <button className="btn ghost sm" onClick={() => setToast(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
      </section>

      <ReceiveReconcile
        invoice={invoice}
        supplier={supplier}
        onPatchTotals={(patch) => app.updateInvoiceTotals(invoiceId, patch)}
        derivedSubtotal={derivedSubtotal}
        mismatch={mismatch}
        totalRaw={totalRaw}
        onTotalRawChange={setTotalOverrideRaw}
        enteredTotal={enteredTotal}
        delta={delta}
        pctDelta={pctDelta}
        beyondTolerance={beyondTolerance}
        expectedSellValue={expectedSellValue}
        expectedMarginPct={expectedMarginPct}
        belowCostLines={belowCostLines}
        onFinalize={doFinalize}
        onSaveUpdates={doSaveUpdates}
        onPrintAllLabels={printAllLabels}
        mintedCount={mintedCount}
      />

      {removing && (
        <RemoveLineModal
          line={removing}
          record={app.recordFor(removing.recordId)}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            const res = app.removeInvoiceLine(invoiceId, removing.id);
            if (res.blocked) {
              setToast("Can't remove that line — one of its copies has already sold.");
            } else {
              if (editingLineId === removing.id) setEditingLineId(null);
              setToast("Line removed.");
            }
            setRemoving(null);
          }}
        />
      )}

      {titlecardFor && (
        <Modal title="Titlecard — E-04" wide onClose={() => setTitlecardFor(null)}>
          <TitlecardPanel
            recordId={titlecardFor}
            onStatus={setToast}
            showCost
            onToggleShowCost={() => {}}
          />
        </Modal>
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
            summary would print here (decision 22). The Invoice itself stays open for correction
            until it's marked paid (decision 40).
          </div>
        </Modal>
      )}
    </>
  );
}

// Where a resolved scan waits while it gets its cost — the scan slab, and
// under it the one row that still needs a decision.
//
// This replaces the fillable last row of the line table. On a 60-line invoice
// that row was below the fold, so entry scrolled away from the scan that fed
// it; here both are fixed above the scrolling list and neither moves.
function StageCard({
  invoiceId,
  mode,
  supplier,
  autoAccept,
  finalized,
  prefillOrder,
  onPrefillConsumed,
  onCommitted,
}: {
  invoiceId: string;
  mode: IntakeMode;
  supplier: Supplier;
  autoAccept: boolean;
  finalized: boolean;
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

  // Clearing the record has to clear everything that came WITH it — leaving a
  // stale cost/discount/sell/qty behind after "pick a different record" would
  // silently carry pricing from one title onto another.
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
    // (including a catalog-only match, which "search" collapses into in this
    // prototype) — no match opens Lookup, decision 24's fallback.
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

  const { listPrice, discountPct, extPrice, suggested, sellPrice, marginPct, belowCost } =
    useLinePricing({
      listRaw,
      discountRaw,
      sellRaw,
      autoAccept,
      stickyPrice: mode === "New" ? record?.stickyPrice : undefined,
      supplier,
    });
  const ready = !!record && listPrice > 0 && sellPrice > 0;
  const lineQty = mode === "New" ? qty : 1;

  const commit = () => {
    if (!record) return;
    // Read the PO off the pending line while it still exists — receiving it
    // consumes it, and after that nothing on the invoice line would say which
    // PO the copy arrived against (d43).
    const order = fromOrderId ? app.pendingOrders.find((o) => o.id === fromOrderId) : undefined;
    app.addInvoiceLine(invoiceId, {
      recordId: record.id,
      scannedCode: scannedCode.trim() || undefined,
      listPrice,
      discountPct,
      acceptedPrice: sellPrice,
      grade: mode === "New" ? "M" : grade,
      qty: lineQty,
      fromOrderId: fromOrderId ?? undefined,
      poNumber: order?.poNumber,
    });
    if (fromOrderId) app.receivePendingOrderLine(fromOrderId);
    onCommitted(
      `Added ${lineQty}× ${record.artist} — ${record.title} at ${money(sellPrice)} (cost ${money(extPrice)}).`,
    );
  };

  return (
    <>
      <div className="recv-scan">
        <div className="scan-slab">
          <div className="lab" style={{ marginBottom: "var(--sp-1)" }}>
            Scan
          </div>
          <div className="row">
            <input
              type="text"
              autoFocus
              value={scannedCode}
              placeholder="scan a barcode…"
              aria-label="Scan a barcode to start a line"
              onChange={(e) => setScannedCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && resolveCode(scannedCode)}
            />
            {/* No resolve button: a scanner types the code and sends Return,
                and a code typed by hand ends the same way. What is left is the
                one thing the field cannot do for itself — find a title when
                the code resolves to nothing (d24's fallback). */}
            <button
              className="btn recv-scan-look"
              onClick={() => setLookupOpen(true)}
              title="Look up a title — for an unbarcoded copy, or a code that finds nothing"
              aria-label="Look up a title"
            >
              <MagnifierIcon />
            </button>
          </div>
          {finalized && (
            <div className="recv-scan-note">
              Finalized and sellable — a late carton can still be scanned in until this Invoice is
              paid (d4, d40).
            </div>
          )}
        </div>
      </div>

      {record && (
        <div className="recv-stage">
          <div className="recv-stage-in">
            {/* Art is a stored URL (A-14) and the provider misses often, so the
                missing state is designed rather than left to a broken image. */}
            {record.art ? (
              <span className="recv-art">{record.art}</span>
            ) : (
              <span className="recv-art empty">no art</span>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="recv-stage-title">
                {record.artist} — {record.title}
              </div>
              <div className="recv-stage-sub">
                {record.label} · {record.catalogNo} · {record.year}
                {fromOrderId ? " · against a PO line" : ""}
                {scannedCode ? ` · ${scannedCode}` : ""}
              </div>

              <div className="recv-stage-fields">
                <label className="field">
                  <span>List price</span>
                  <input
                    {...figureField}
                    value={listRaw}
                    onChange={(e) => setListRaw(numericOnly(e.target.value))}
                  />
                  <span className="recv-stage-hint">pre-discount</span>
                </label>
                <label className="field">
                  <span>Disc%</span>
                  <input
                    {...figureField}
                    value={discountRaw}
                    onChange={(e) => setDiscountRaw(numericOnly(e.target.value))}
                  />
                  <span className="recv-stage-hint">cost {money(extPrice)}</span>
                </label>
                <label className="field">
                  <span>Sell price</span>
                  {autoAccept ? (
                    <input type="text" value={money(sellPrice)} disabled />
                  ) : (
                    <input
                      {...figureField}
                      value={sellRaw ?? suggested.toFixed(2)}
                      onChange={(e) => setSellRaw(numericOnly(e.target.value))}
                    />
                  )}
                  <span className="recv-stage-hint">
                    {record.stickyPrice != null && mode === "New" ? "sticky · " : ""}suggested{" "}
                    {money(suggested)}
                  </span>
                </label>
                <label className="field">
                  <span>Grade</span>
                  {mode === "Second-hand" ? (
                    <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value="M" disabled />
                  )}
                  <span className="recv-stage-hint">
                    {mode === "Second-hand" ? "graded per copy" : "new stock default"}
                  </span>
                </label>
                <label className="field recv-stage-qty">
                  <span>Qty</span>
                  {mode === "New" ? (
                    <input
                      {...countField}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, Number(integerOnly(e.target.value))))}
                    />
                  ) : (
                    <input type="text" value="1" disabled />
                  )}
                  <span className="recv-stage-hint">&nbsp;</span>
                </label>
              </div>
            </div>

            {/* Cost, margin and net are what "add this line or don't" turns on,
                so they sit in their own column with the action under them,
                rather than as the last three slots of a wrapping input row
                where they were the smallest things on the card. */}
            <div className="recv-readout">
              <div className={"recv-readout-fig" + (listPrice > 0 ? "" : " idle")}>
                <span className="lab">Cost each</span>
                <span className="v">{listPrice > 0 ? money(extPrice) : "—"}</span>
              </div>
              <div
                className={
                  "recv-readout-fig lead" +
                  (listPrice <= 0 ? " idle" : belowCost ? " bad" : " ok")
                }
              >
                <span className="lab">Margin</span>
                {/* With no cost typed yet the margin computes to 100%, a number
                    that invites acceptance and means nothing. Cost is entered
                    on every receipt (d13) — until it is, this says so rather
                    than flattering the line. */}
                <span className="v">{listPrice > 0 ? `${marginPct.toFixed(1)}%` : "—"}</span>
              </div>
              <div className={"recv-readout-fig" + (listPrice > 0 ? "" : " idle")}>
                <span className="lab">Net · {lineQty} cop{lineQty === 1 ? "y" : "ies"}</span>
                <span className="v">
                  {listPrice > 0 ? money(extPrice * lineQty) : "enter their cost"}
                </span>
              </div>

              <div className="recv-readout-acts">
                <button
                  className={"btn" + (belowCost ? " danger" : " primary")}
                  disabled={!ready}
                  onClick={commit}
                  title={
                    belowCost
                      ? "Below cost — proceeds and raises a review flag (d35)"
                      : "Add this line"
                  }
                >
                  {belowCost ? "⚠ Add below cost" : "Add line ⏎"}
                </button>
                <button className="btn ghost" onClick={clearRow}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}

// Removing a line is destructive, reachable in one tap from the row, and sits
// beside two actions that are not — so it asks first, and says what it is
// about to take with it. A line whose copy has already sold cannot go at all
// (d4); the store is the one that knows, so this states the rule and lets the
// attempt report back rather than guessing here.
function RemoveLineModal({
  line,
  record,
  onClose,
  onConfirm,
}: {
  line: InvoiceLine;
  record?: RecordEntry;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const minted = line.itemIds?.length ?? 0;
  return (
    <Modal
      title="Remove this line?"
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            Remove line
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          <strong>{record ? `${record.artist} — ${record.title}` : line.recordId}</strong>
          <br />
          {line.qty} cop{line.qty === 1 ? "y" : "ies"} at {money(line.acceptedPrice)}, cost{" "}
          {money(line.cost)} each.
        </p>
        {minted > 0 && (
          <div className="callout">
            {minted} sellable cop{minted === 1 ? "y has" : "ies have"} already been minted from this
            line and will be removed with it. A copy that has already sold cannot be removed — fix
            that in E-04 instead (d4).
          </div>
        )}
      </div>
    </Modal>
  );
}

// Row icons. Emoji were doing this job and doing it badly: they render at
// whatever size and colour the platform's font decides, so ✏ arrived as a
// tiny coloured pencil that read as a stray mark, and 🏷 as a label tag that
// nobody connected with printing. These are line icons on currentColor, the
// same way the slab's are, so they take the button's colour and stay legible
// at 15px.
const ROW_ICON = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const MagnifierIcon = () => (
  <svg {...ROW_ICON} width={19} height={19}>
    <circle cx="11" cy="11" r="6" />
    <path d="M15.6 15.6L20 20" />
  </svg>
);
const PencilIcon = () => (
  <svg {...ROW_ICON}>
    <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z" />
    <path d="M14.5 5.5l4 4" />
  </svg>
);
// A printer, not a luggage tag — the thing that comes out of it is what the
// button does.
const PrinterIcon = () => (
  <svg {...ROW_ICON}>
    <path d="M7 9V3h10v6" />
    <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7z" />
  </svg>
);
const CrossIcon = () => (
  <svg {...ROW_ICON}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
// A cross closes things. It was doing duty as "remove this line", which is
// the opposite of what a cross means everywhere else — so it cancels now, and
// deleting gets the can.
const TrashIcon = () => (
  <svg {...ROW_ICON}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
const CheckIcon = () => (
  <svg {...ROW_ICON}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
// Saving a below-cost price is not the same act as saving — it raises a review
// flag (d35) — so it does not wear the same mark.
const AlertIcon = () => (
  <svg {...ROW_ICON}>
    <path d="M12 4.5L21 19.5H3L12 4.5z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.1" />
  </svg>
);

// Cover art is a stored URL (A-14) and the catalogue misses often, so the
// missing state is designed rather than left to a broken image. All three row
// renderers use this one cell so an edited line never shifts against a read one.
function ArtCell({ record }: { record?: RecordEntry }) {
  return (
    <td className="recv-art-cell">
      {record ? (
        <span className="recv-art">{record.art}</span>
      ) : (
        <span className="recv-art empty">no art</span>
      )}
    </td>
  );
}

function ReadLineRow({
  line,
  record,
  locked,
  onEdit,
  onPrintLabel,
  onRemove,
  onOpenTitlecard,
}: {
  line: InvoiceLine;
  record?: RecordEntry;
  locked: boolean;
  onEdit: () => void;
  onPrintLabel: () => void;
  onRemove: () => void;
  onOpenTitlecard: () => void;
}) {
  const marginPct = line.acceptedPrice > 0 ? round2(((line.acceptedPrice - line.cost) / line.acceptedPrice) * 100) : 0;
  const minted = (line.itemIds?.length ?? 0) > 0;
  // Below cost proceeds and raises a review flag rather than blocking (d35) —
  // so the row has to carry the flag, or the only place it appears is a queue
  // nobody is looking at while the shipment is open.
  const belowCost = line.acceptedPrice < line.cost;
  return (
    <tr className={belowCost ? "recv-flagged" : undefined}>
      <ArtCell record={record} />
      <td className="recv-rec">
        {/* The title is clipped to keep rows short, so it needs somewhere to
            be read in full — clicking it opens the Record's titlecard (E-04),
            which is also where you check that what you scanned is what you
            meant to scan. */}
        <button
          type="button"
          className="recv-rec-open"
          onClick={onOpenTitlecard}
          disabled={!record}
          title={record ? `${record.artist} — ${record.title} — open titlecard` : "No Record"}
        >
          <span className="t">{record ? `${record.artist} — ${record.title}` : line.recordId}</span>
          <span className="m">
            {record ? `${record.label} · ${record.year}` : ""}
            {line.poNumber ? ` · ${line.poNumber}` : ""}
            {line.scannedCode ? ` · ${line.scannedCode}` : ""}
          </span>
        </button>
      </td>
      <td>
        <span className="badge grade">{line.grade}</span>
      </td>
      <td className="num">{money(line.listPrice)}</td>
      <td className="num">{line.discountPct}%</td>
      <td className="num">{money(line.acceptedPrice)}</td>
      <td className={"num small recv-margin" + (belowCost ? " bad" : " muted")}>
        {marginPct.toFixed(1)}%
      </td>
      <td className="num">{line.qty}</td>
      <td className="num">{money(line.cost * line.qty)}</td>
      <td className="num">
        <div className="recv-row-acts">
          {!locked && (
            <button
              className="btn ghost sm icon-btn"
              onClick={onEdit}
              title="Edit this line"
              aria-label="Edit this line"
            >
              <PencilIcon />
            </button>
          )}
          <button
            className="btn ghost sm icon-btn"
            onClick={onPrintLabel}
            disabled={!minted}
            title={minted ? "Print label — stub, hooked up down the line" : "Print label — nothing minted yet"}
            aria-label="Print label"
          >
            <PrinterIcon />
          </button>
          {/* Removing a line no longer means opening it first. It still asks,
              because this is a destructive action on a touch counter sitting
              next to two that are not. */}
          {!locked && (
            <button
              className="btn ghost sm icon-btn recv-danger"
              onClick={onRemove}
              title="Remove this line"
              aria-label="Remove this line"
            >
              <TrashIcon />
            </button>
          )}
        </div>
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
  onRemove,
  onOpenTitlecard,
}: {
  invoiceId: string;
  line: InvoiceLine;
  mode: IntakeMode;
  supplier: Supplier;
  onDone: () => void;
  onRemove: () => void;
  onOpenTitlecard: () => void;
}) {
  const app = useApp();
  const record = app.recordFor(line.recordId);
  const [listRaw, setListRaw] = useState(String(line.listPrice));
  const [discountRaw, setDiscountRaw] = useState(String(line.discountPct));
  const [sellRaw, setSellRaw] = useState<string | null>(String(line.acceptedPrice));
  const [grade, setGrade] = useState<Grade>(line.grade);
  const [qty, setQty] = useState(line.qty);

  const { extPrice, sellPrice, marginPct, belowCost } = useLinePricing({
    listRaw,
    discountRaw,
    sellRaw,
    autoAccept: false,
    stickyPrice: mode === "New" ? record?.stickyPrice : undefined,
    supplier,
  });

  const save = () => {
    app.updateInvoiceLine(invoiceId, line.id, {
      listPrice: Number(listRaw) || 0,
      discountPct: Number(discountRaw) || 0,
      acceptedPrice: sellPrice,
      grade: mode === "New" ? line.grade : grade,
      qty: mode === "New" ? qty : line.qty,
    });
    onDone();
  };

  return (
    <tr className="recv-editing">
      <ArtCell record={record} />
      <td className="recv-rec">
        <button
          type="button"
          className="recv-rec-open"
          onClick={onOpenTitlecard}
          disabled={!record}
          title={record ? `${record.artist} — ${record.title} — open titlecard` : "No Record"}
        >
          <span className="t">{record ? `${record.artist} — ${record.title}` : line.recordId}</span>
          <span className="m">
            {record ? `${record.label} · ${record.year}` : ""}
            {line.scannedCode ? ` · ${line.scannedCode}` : ""}
          </span>
        </button>
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
          <span className="badge grade">{line.grade}</span>
        )}
      </td>
      <td className="num">
        <input
          className="inline-num"
          {...figureField}
          value={listRaw}
          onChange={(e) => setListRaw(numericOnly(e.target.value))}
          aria-label="List price — pre-discount"
        />
      </td>
      <td className="num">
        <input
          className="inline-pct"
          {...figureField}
          value={discountRaw}
          onChange={(e) => setDiscountRaw(numericOnly(e.target.value))}
          aria-label="Supplier discount %"
        />
      </td>
      <td className="num">
        <input
          className="inline-num"
          {...figureField}
          value={sellRaw ?? ""}
          onChange={(e) => setSellRaw(numericOnly(e.target.value))}
          aria-label="Sell price"
        />
      </td>
      <td className={"num small recv-margin" + (belowCost ? " bad" : " muted")}>
        {marginPct.toFixed(1)}%
      </td>
      <td className="num">
        {mode === "New" ? (
          <input
            className="inline-num"
            {...countField}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(integerOnly(e.target.value))))}
            aria-label="Quantity"
          />
        ) : (
          1
        )}
      </td>
      <td className="num small muted">{money(extPrice * (mode === "New" ? qty : 1))}</td>
      <td className="num">
        {/* Icons, like the read row's — three word-buttons wrapped in this
            column and took the edited row to 94px, twice every other row.
            Each carries its title and label, and the save button still says
            in its tooltip what accepting a below-cost price does (d35). */}
        <div className="recv-row-acts">
          <button
            className="btn ghost sm icon-btn recv-danger"
            onClick={onRemove}
            title="Remove this line"
            aria-label="Remove this line"
          >
            <TrashIcon />
          </button>
          <button
            className="btn ghost sm icon-btn"
            onClick={onDone}
            title="Cancel — leave the line as it was"
            aria-label="Cancel"
          >
            <CrossIcon />
          </button>
          <button
            className={"btn sm icon-btn" + (belowCost ? " danger" : " primary")}
            onClick={save}
            title={
              belowCost
                ? "Save — below cost, proceeds and raises a review flag (d35)"
                : "Save this line"
            }
            aria-label={belowCost ? "Save — below cost, raises a review flag" : "Save this line"}
          >
            {belowCost ? <AlertIcon /> : <CheckIcon />}
          </button>
        </div>
      </td>
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
                    {r.catalogOnly && <span className="badge warn" style={{ marginLeft: 6 }}>Catalog match</span>}
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
        No barcode, no catalog match — capture what decision 24 asks for. Format, year, and
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
