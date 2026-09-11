import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { ReceiveReconcile } from "../components/ReceiveReconcile";
import { ReceiveSlab, type OutstandingLine } from "../components/ReceiveSlab";
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
  const [poFilter, setPoFilter] = useState<string | null>(null);
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

  // The worklist (d29): outstanding PurchaseOrder lines across ALL open POs,
  // not scoped to one supplier — suppliers ship several POs in one box (d28).
  const outstanding: OutstandingLine[] = useMemo(() => {
    const q = term.trim().toLowerCase();
    // Ordered minus received against that PO line across every Invoice (d30).
    // Partial receipt is not modelled in the prototype store — a received line
    // is removed outright — so `received` is always 0 today and the row reads
    // as a plain ordered quantity rather than a fake "n of m".
    const receivedAgainst = (orderId: string) =>
      app.invoices.reduce(
        (n, iv) => n + iv.lines.filter((l) => l.fromOrderId === orderId).reduce((m, l) => m + l.qty, 0),
        0,
      );

    return app.pendingOrders
      .map((order) => {
        const record = app.recordFor(order.recordId);
        const received = receivedAgainst(order.id);
        return {
          order,
          record,
          outstanding: Math.max(0, order.qty - received),
          partiallyReceived: received > 0,
        };
      })
      .filter(({ order, record, outstanding: left }) => {
        if (left <= 0) return false;
        if (poFilter && (order.poNumber ?? "unplaced") !== poFilter) return false;
        if (!q) return true;
        return (
          record?.title.toLowerCase().includes(q) ||
          record?.artist.toLowerCase().includes(q) ||
          record?.catalogNo.toLowerCase().includes(q) ||
          (order.scannedCode ?? "").toLowerCase().includes(q) ||
          (order.poNumber ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const pa = a.order.poNumber ?? "~";
        const pb = b.order.poNumber ?? "~";
        return pa.localeCompare(pb) || (a.record?.title ?? "").localeCompare(b.record?.title ?? "");
      });
  }, [app.pendingOrders, app.invoices, app.records, term, poFilter]);

  // Chips are built from every open PO, not from the filtered list — otherwise
  // picking one chip would hide the others and strand you inside it.
  const poCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of app.pendingOrders) {
      const key = order.poNumber ?? "unplaced";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([po, count]) => ({ po, count }))
      .sort((a, b) => a.po.localeCompare(b.po));
  }, [app.pendingOrders]);

  // A URL invoiceId always wins; without one, the oldest open draft stands in,
  // then the most recent finished intake. Picking anything puts it in the URL
  // and it stops moving.
  const selectedId = invoiceId ?? drafts[0]?.id ?? recent[0]?.id;
  const selected = app.invoiceFor(selectedId);

  const select = (id: string) => nav(`/receiving/${id}`, { replace: true });

  const pickOrder = (order: PendingOrderLine) => {
    setPrefillOrder(order);
    // Picking a worklist line with no invoice open is a request to start one:
    // the alternative is a silent no-op, which reads as a broken button.
    if (!selected || selected.status === "Paid") setCreating(true);
  };

  return (
    <div className={"recv-frame" + (slabOpen ? "" : " slab-shut")}>
      <ReceiveSlab
        open={slabOpen}
        onOpenChange={setSlabOpen}
        term={term}
        onTermChange={setTerm}
        poFilter={poFilter}
        onPoFilterChange={setPoFilter}
        outstanding={outstanding}
        poCounts={poCounts}
        drafts={drafts}
        recent={recent}
        selectedId={selected?.id}
        onSelect={select}
        onNewIntake={() => setCreating(true)}
        onOpenExisting={() => setOpening(true)}
        onPickOrder={pickOrder}
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
  const app = useApp();
  const invoice = app.invoiceFor(invoiceId)!;
  const supplier = app.supplierFor(invoice.supplierId)!;

  const [autoAccept, setAutoAccept] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);

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
  const [labelsNote, setLabelsNote] = useState<string | null>(null);

  const doFinalize = () => {
    if (delta !== 0) app.setInvoiceTotalOverride(invoiceId, enteredTotal);
    const res = app.finalizeInvoice(invoiceId);
    if (res) setFinalizedCount(res.itemCount);
  };

  const doSaveUpdates = () => {
    if (delta !== 0) app.setInvoiceTotalOverride(invoiceId, enteredTotal);
    setNote("Totals saved.");
  };

  const mintedCount = invoice.lines.reduce((sum, l) => sum + (l.itemIds?.length ?? 0), 0);
  const printAllLabels = () =>
    setLabelsNote(
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
            prefillOrder={prefillOrder}
            onPrefillConsumed={onPrefillConsumed}
            onCommitted={(msg) => {
              setNote(msg);
              setStageKey((k) => k + 1);
            }}
          />
        )}

        {(note || labelsNote || mismatch) && (
          <div className="recv-notes">
            {note && <div className="callout ok">{note}</div>}
            {labelsNote && <div className="callout ok">{labelsNote}</div>}
            {mismatch && (
              <div className="callout">
                Derived subtotal doesn't match the supplier's stated subtotal — a discrepancy
                warning, not a block. Recheck the lines, or proceed if it's explainable.{" "}
                <em>(Decision 18.)</em>
              </div>
            )}
          </div>
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
                    onRemove={() => {
                      const res = app.removeInvoiceLine(invoiceId, l.id);
                      if (res.blocked) {
                        setNote("Can't remove that line — one of its copies has already sold.");
                      } else {
                        setEditingLineId(null);
                      }
                    }}
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
                      setLabelsNote(
                        `${n} label${n === 1 ? "" : "s"} would print here (stub) — hooked up down the line.`,
                      );
                    }}
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
    app.addInvoiceLine(invoiceId, {
      recordId: record.id,
      scannedCode: scannedCode.trim() || undefined,
      listPrice,
      discountPct,
      acceptedPrice: sellPrice,
      grade: mode === "New" ? "M" : grade,
      qty: lineQty,
      fromOrderId: fromOrderId ?? undefined,
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
            <button className="btn ghost sm" onClick={() => resolveCode(scannedCode)} title="Resolve">
              ↵
            </button>
            <button className="btn ghost sm" onClick={() => setLookupOpen(true)}>
              Lookup
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
                    type="number"
                    step="0.01"
                    value={listRaw}
                    onChange={(e) => setListRaw(e.target.value)}
                  />
                  <span className="recv-stage-hint">pre-discount</span>
                </label>
                <label className="field">
                  <span>Disc%</span>
                  <input
                    type="number"
                    value={discountRaw}
                    onChange={(e) => setDiscountRaw(e.target.value)}
                  />
                  <span className="recv-stage-hint">cost {money(extPrice)}</span>
                </label>
                <label className="field">
                  <span>Sell price</span>
                  {autoAccept ? (
                    <input type="text" value={money(sellPrice)} disabled />
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={sellRaw ?? suggested.toFixed(2)}
                      onChange={(e) => setSellRaw(e.target.value)}
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
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
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
}: {
  line: InvoiceLine;
  record?: RecordEntry;
  locked: boolean;
  onEdit: () => void;
  onPrintLabel: () => void;
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
      <td className="recv-rec" title={record ? `${record.artist} — ${record.title}` : line.recordId}>
        <span className="t">{record ? `${record.artist} — ${record.title}` : line.recordId}</span>
        <span className="m">
          {record ? `${record.label} · ${record.year}` : ""}
          {line.scannedCode ? ` · ${line.scannedCode}` : ""}
        </span>
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
            <button className="btn ghost sm" onClick={onEdit} title="Edit this line">
              ✏
            </button>
          )}
          <button
            className="btn ghost sm"
            onClick={onPrintLabel}
            disabled={!minted}
            title={minted ? "Print label — stub, hooked up down the line" : "Print label — nothing minted yet"}
          >
            🏷
          </button>
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
}: {
  invoiceId: string;
  line: InvoiceLine;
  mode: IntakeMode;
  supplier: Supplier;
  onDone: () => void;
  onRemove: () => void;
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
    <tr>
      <ArtCell record={record} />
      <td className="recv-rec">
        <span className="t">{record ? `${record.artist} — ${record.title}` : line.recordId}</span>
        <span className="m">
          {record ? `${record.label} · ${record.year}` : ""}
          {line.scannedCode ? ` · ${line.scannedCode}` : ""}
        </span>
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
          type="number"
          step="0.01"
          value={listRaw}
          onChange={(e) => setListRaw(e.target.value)}
          aria-label="List price — pre-discount"
        />
      </td>
      <td className="num">
        <input
          className="inline-pct"
          type="number"
          value={discountRaw}
          onChange={(e) => setDiscountRaw(e.target.value)}
          aria-label="Supplier discount %"
        />
      </td>
      <td className="num">
        <input
          className="inline-num"
          type="number"
          step="0.01"
          value={sellRaw ?? ""}
          onChange={(e) => setSellRaw(e.target.value)}
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
          <button className="btn ghost sm" onClick={onRemove} title="Remove this line">
            Remove
          </button>
          <button className="btn ghost sm" onClick={onDone}>
            Cancel
          </button>
          <button
            className={"btn sm" + (belowCost ? " danger" : " primary")}
            onClick={save}
            title={belowCost ? "Below cost — proceeds and raises a review flag" : "Save"}
          >
            {belowCost ? "⚠ Save (below cost)" : "✓ Save"}
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
