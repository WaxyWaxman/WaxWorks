import { useState } from "react";
import { BarcodeInput } from "../components/BarcodeInput";
import { ManagerOverride } from "../components/ManagerOverride";
import { Modal } from "../components/Modal";
import {
  GRADES,
  type Grade,
  type IntakeMode,
  type RecordEntry,
  type Section,
} from "../data/types";
import { money, roundUpShelf } from "../lib/money";
import { round2 } from "../lib/totals";
import { useApp } from "../store/AppStore";

const RECEIVING_SAMPLES = [
  { code: "081227971609", label: "UPC · Blue (already stocked — local hit)" },
  { code: "060758004321", label: "UPC · Horses (catalog-only → pulls in)" },
  { code: "000000000000", label: "No match → search or add manually" },
];

export function Receiving() {
  const app = useApp();
  const drafts = app.invoices.filter((iv) => iv.status === "Draft");
  const finalized = app.invoices.filter((iv) => iv.status === "Finalized");
  const [selectedId, setSelectedId] = useState<string | null>(drafts[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
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
        </div>
      </div>

      {!selected && <div className="callout">Start a new intake, or resume a draft above.</div>}
      {selected && <InvoiceEditor key={selected.id} invoiceId={selected.id} />}

      {finalized.length > 0 && (
        <div className="card" style={{ marginTop: "var(--sp-5)" }}>
          <div className="card-head">Finalized — immutable</div>
          <div className="card-body stack">
            {finalized.map((iv) => {
              const supplier = app.supplierFor(iv.supplierId);
              const total = round2(iv.lines.reduce((sum, l) => sum + l.cost * l.qty, 0) + iv.tax + iv.freight + iv.misc);
              return (
                <div key={iv.id} className="totals-row">
                  <span>
                    {supplier?.shortName} {iv.invoiceNumber} · {iv.intakeMode} ·{" "}
                    {iv.lines.reduce((n, l) => n + l.qty, 0)} cop
                    {iv.lines.reduce((n, l) => n + l.qty, 0) === 1 ? "y" : "ies"}
                  </span>
                  <span className="num">{money(total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {creating && (
        <NewInvoiceModal onClose={() => setCreating(false)} onCreated={(id) => setSelectedId(id)} />
      )}
    </div>
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

function InvoiceEditor({ invoiceId }: { invoiceId: string }) {
  const app = useApp();
  const invoice = app.invoiceFor(invoiceId)!;
  const supplier = app.supplierFor(invoice.supplierId)!;

  const [findOrCreate, setFindOrCreate] = useState(false);
  const [addingFor, setAddingFor] = useState<RecordEntry | null>(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [overrideTotal, setOverrideTotal] = useState<{ enteredTotal: number } | null>(null);
  const [finalized, setFinalized] = useState<number | null>(null);

  const locked = invoice.status === "Finalized";

  const doScan = (code: string) => {
    const rec = app.records.find((r) => r.manufacturerUpc === code);
    if (rec) {
      setScanNote(
        rec.catalogOnly
          ? `Discogs match — ${rec.artist} — ${rec.title}. Receiving it pulls it into the local catalog (E-03 decision 6).`
          : `Local hit — ${rec.artist} — ${rec.title}.`,
      );
      setAddingFor(rec);
    } else {
      setScanNote(`No match for “${code}” — search the local catalog or add it manually.`);
      setFindOrCreate(true);
    }
  };

  const derivedSubtotal = round2(invoice.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
  const mismatch = Math.abs(derivedSubtotal - invoice.statedSubtotal) > 0.01;
  const computedTotal = round2(derivedSubtotal + invoice.tax + invoice.freight + invoice.misc);
  // Tracks computedTotal live as lines/tax/freight/misc change, until the
  // employee actually types a different figure off the paper invoice — a
  // one-time snapshot would go stale the moment a second line is scanned
  // and falsely flag a huge "needs override" gap that was never real.
  const [totalOverrideRaw, setTotalOverrideRaw] = useState<string | null>(null);
  const totalRaw = totalOverrideRaw ?? computedTotal.toFixed(2);
  const enteredTotal = Number(totalRaw) || 0;
  const delta = round2(enteredTotal - computedTotal);
  const pctDelta = computedTotal !== 0 ? Math.abs(delta) / computedTotal : Math.abs(delta) > 0 ? 1 : 0;
  const needsOverride = Math.abs(delta) > 0.005 && pctDelta > 0.02;

  const doFinalize = () => {
    if (delta !== 0) app.setInvoiceTotalOverride(invoiceId, enteredTotal);
    const res = app.finalizeInvoice(invoiceId);
    if (res) setFinalized(res.itemCount);
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
            {!locked && (
              <>
                <BarcodeInput onScan={doScan} samples={RECEIVING_SAMPLES} placeholder="Scan the item's manufacturer barcode…" />
                {scanNote && <div className="callout ok">{scanNote}</div>}
                <label className="row">
                  <input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} />
                  <span className="small">
                    Auto-accept suggested/sticky price for the rest of this invoice (step 13)
                  </span>
                </label>
              </>
            )}
            {locked && (
              <div className="callout">
                Finalized invoices are immutable — voids and amendments are manager-only, handled
                in E-04 (decision 23, not in this pass).
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Lines</div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Grade</th>
                  <th className="num">List</th>
                  <th className="num">Cost</th>
                  <th className="num">Accepted</th>
                  <th className="num">Qty</th>
                  <th className="num">Net cost</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => {
                  const rec = app.recordFor(l.recordId);
                  return (
                    <tr key={l.id}>
                      <td>{rec ? `${rec.artist} — ${rec.title}` : l.recordId}</td>
                      <td>
                        <span className="badge grade">{l.grade}</span>
                      </td>
                      <td className="num">{money(l.listPrice)}</td>
                      <td className="num">{money(l.cost)}</td>
                      <td className="num">{money(l.acceptedPrice)}</td>
                      <td className="num">{l.qty}</td>
                      <td className="num">{money(l.cost * l.qty)}</td>
                      <td className="num">
                        {!locked && (
                          <button className="btn ghost sm" onClick={() => app.removeInvoiceLine(invoiceId, l.id)}>
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {invoice.lines.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted small">
                      No lines yet — scan something.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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

      {findOrCreate && (
        <FindOrCreateRecordModal
          onClose={() => setFindOrCreate(false)}
          onPick={(rec) => {
            setFindOrCreate(false);
            setAddingFor(rec);
          }}
        />
      )}
      {addingFor && (
        <AddLineModal
          invoiceId={invoiceId}
          record={addingFor}
          mode={invoice.intakeMode}
          supplier={supplier}
          autoAccept={autoAccept}
          onClose={() => setAddingFor(null)}
          onDone={(msg) => {
            setAddingFor(null);
            setScanNote(msg);
          }}
        />
      )}
      {overrideTotal && (
        <ManagerOverride
          reason={`Reconcile ${supplier.shortName} ${invoice.invoiceNumber} total to ${money(overrideTotal.enteredTotal)} — ${money(delta)} beyond the ±2% bound.`}
          onCancel={() => setOverrideTotal(null)}
          onConfirm={(by) => {
            app.setInvoiceTotalOverride(invoiceId, overrideTotal.enteredTotal, by);
            const res = app.finalizeInvoice(invoiceId);
            setOverrideTotal(null);
            if (res) setFinalized(res.itemCount);
          }}
        />
      )}
      {finalized !== null && (
        <Modal
          title="Invoice finalized"
          onClose={() => setFinalized(null)}
          foot={
            <button className="btn primary" onClick={() => setFinalized(null)}>
              Done
            </button>
          }
        >
          <div className="callout ok">
            {finalized} cop{finalized === 1 ? "y" : "ies"} now sellable. A letter-size summary
            would print here (decision 22). The invoice is now immutable (decision 23).
          </div>
        </Modal>
      )}
    </div>
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

function AddLineModal({
  invoiceId,
  record,
  mode,
  supplier,
  autoAccept,
  onClose,
  onDone,
}: {
  invoiceId: string;
  record: RecordEntry;
  mode: IntakeMode;
  supplier: { marginPct: number };
  autoAccept: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const app = useApp();
  const [listRaw, setListRaw] = useState("0.00");
  const [costRaw, setCostRaw] = useState("0.00");
  const [grade, setGrade] = useState<Grade>(mode === "New" ? "M" : "VG");
  const [qty, setQty] = useState(1);
  const [acceptedRaw, setAcceptedRaw] = useState<string | null>(null);
  const [override, setOverride] = useState(false);

  const listPrice = Number(listRaw) || 0;
  const cost = Number(costRaw) || 0;
  const suggested = record.stickyPrice ?? roundUpShelf(listPrice * (1 + supplier.marginPct / 100));
  const accepted = autoAccept ? suggested : Number(acceptedRaw ?? suggested.toFixed(2)) || 0;
  const belowCost = accepted > 0 && accepted < cost;

  const commit = (overrideBy?: string) => {
    app.addInvoiceLine(
      invoiceId,
      {
        recordId: record.id,
        listPrice,
        cost,
        acceptedPrice: accepted,
        grade: mode === "New" ? "M" : grade,
        qty: mode === "New" ? qty : 1,
      },
      overrideBy,
    );
    const n = mode === "New" ? qty : 1;
    onDone(`Added ${n}× ${record.artist} — ${record.title} at ${money(accepted)} (cost ${money(cost)}).`);
    onClose();
  };

  return (
    <Modal
      title={`${record.artist} — ${record.title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={cost <= 0}
            onClick={() => (belowCost ? setOverride(true) : commit())}
          >
            {belowCost ? "Below cost — get manager override" : "Add line"}
          </button>
        </>
      }
    >
      <div className="stack">
        {record.catalogOnly && (
          <div className="callout">
            Discogs match, not yet in local stock — adding this line pulls it into the catalog.{" "}
            <em>(E-03 decision 6.)</em>
          </div>
        )}
        <div className="grid cols-2">
          <label className="field">
            <span>List price (pre-discount)</span>
            <input type="number" step="0.01" value={listRaw} onChange={(e) => setListRaw(e.target.value)} />
          </label>
          <label className="field">
            <span>Cost — Ext. Price, post-discount (decision 7)</span>
            <input type="number" step="0.01" value={costRaw} onChange={(e) => setCostRaw(e.target.value)} />
          </label>
        </div>

        <div className="callout">
          Suggested retail {money(suggested)}
          {record.stickyPrice != null && mode === "New" ? " — from the sticky price (decision 12)" : ` — ${supplier.marginPct}% margin on list (decision 8)`}
          .
        </div>

        {autoAccept ? (
          <div className="small muted">Accepted price (auto): {money(accepted)}</div>
        ) : (
          <label className="field">
            <span>Accepted price — always editable, never applied silently (decision 12)</span>
            <input
              type="number"
              step="0.01"
              value={acceptedRaw ?? suggested.toFixed(2)}
              onChange={(e) => setAcceptedRaw(e.target.value)}
            />
          </label>
        )}

        {mode === "Second-hand" ? (
          <label className="field">
            <span>Condition grade — required for second-hand (decision, step 14)</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <div className="small muted">Condition defaults to Mint/Sealed (New mode).</div>
            <label className="field">
              <span>Quantity — identical copies at this cost/price/condition</span>
              <input
                className="inline-num"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              />
            </label>
          </>
        )}

        {belowCost && (
          <div className="callout danger">
            <strong>Below-cost guardrail.</strong> Accepted price is under cost — needs a manager
            override (decision 10).
          </div>
        )}
      </div>
      {override && (
        <ManagerOverride
          reason={`Accept ${money(accepted)} below cost ${money(cost)} for ${record.artist} — ${record.title}.`}
          onCancel={() => setOverride(false)}
          onConfirm={(by) => commit(by)}
        />
      )}
    </Modal>
  );
}
