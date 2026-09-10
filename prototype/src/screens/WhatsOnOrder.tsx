import { useMemo, useState } from "react";
import { BarcodeInput } from "../components/BarcodeInput";
import { Modal } from "../components/Modal";
import type { PendingOrderLine } from "../data/types";
import { money } from "../lib/money";
import { daysAgo, followUpDueAt, isFollowUpOverdue } from "../lib/totals";
import { useApp } from "../store/AppStore";

// What's on Order (M-02 Phase 3) — every placed line (poNumber set) that
// hasn't been received yet. Order Processing (Phase 2) is where a line gets
// here; Receiving (E-02) is where it leaves — receivePendingOrderLine drops
// it from `pendingOrders` entirely, so "on order" is just "still in the
// array with a PO number."
//
// Set status (Backordered/Cancelled) and voiding a PO — the rest of Phase 3
// per the flow doc — aren't built here yet; this covers tracking only:
// search, sort, filter, and re-flag.
type SortKey = "age" | "title" | "artist";

const SAMPLE_CODES = [
  { code: "081227971609", label: "UPC · Blue" },
  { code: "075992511018", label: "UPC · Purple Rain" },
  { code: "888751545519", label: "UPC · Kind of Blue" },
  { code: "060758004321", label: "UPC · Horses" },
];

export function WhatsOnOrder() {
  const app = useApp();
  const [query, setQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [poFilter, setPoFilter] = useState("");
  const [reflagTarget, setReflagTarget] = useState<PendingOrderLine | null>(null);

  const onOrder = useMemo(() => app.pendingOrders.filter((o) => o.poNumber), [app.pendingOrders]);

  const suppliersOnOrder = useMemo(
    () => app.suppliers.filter((sup) => onOrder.some((o) => o.supplierId === sup.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [app.suppliers, onOrder],
  );
  const posOnOrder = useMemo(
    () =>
      [...new Set(onOrder.filter((o) => !supplierFilter || o.supplierId === supplierFilter).map((o) => o.poNumber!))].sort(),
    [onOrder, supplierFilter],
  );

  const doScan = (code: string) => {
    const rec = app.records.find((r) => r.manufacturerUpc === code.trim());
    if (rec) {
      setQuery(`${rec.artist} — ${rec.title}`);
      setStatusMsg(`Matched ${rec.artist} — ${rec.title} by UPC.`);
    } else {
      setQuery(code.trim());
      setStatusMsg(`No catalog UPC match for "${code}" — filtering as a keyword instead.`);
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = onOrder.filter((o) => {
      if (supplierFilter && o.supplierId !== supplierFilter) return false;
      if (poFilter && o.poNumber !== poFilter) return false;
      if (!q) return true;
      const rec = app.recordFor(o.recordId);
      const sup = app.supplierFor(o.supplierId);
      return [
        rec?.artist,
        rec?.title,
        rec && `${rec.artist} — ${rec.title}`, // matches what a UPC scan fills the box with, and what the row displays
        rec?.catalogNo,
        rec?.manufacturerUpc,
        o.poNumber,
        sup?.name,
        sup?.shortName,
      ]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });

    const cmp = (a: PendingOrderLine, b: PendingOrderLine): number => {
      if (sortKey === "age") return a.createdAt.localeCompare(b.createdAt); // oldest first
      const ra = app.recordFor(a.recordId);
      const rb = app.recordFor(b.recordId);
      if (sortKey === "title") return (ra?.title ?? "").localeCompare(rb?.title ?? "");
      return (ra?.artist ?? "").localeCompare(rb?.artist ?? "");
    };

    // Overdue lines always surface at the top (M-02 §"Tracking what's on
    // order", step 9), sorted the same way as everything else within each
    // group rather than by a separate rule.
    const overdue = filtered.filter((o) => isFollowUpOverdue(o)).sort(cmp);
    const rest = filtered.filter((o) => !isFollowUpOverdue(o)).sort(cmp);
    return [...overdue, ...rest];
  }, [onOrder, query, supplierFilter, poFilter, sortKey, app]);

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">M-02</span>
        <div>
          <h1>What's on Order</h1>
          <p className="sub">
            Every individual line placed on a PurchaseOrder and not yet received, oldest first.
            Lines past their follow-up flag surface at the top in red. Set status (Backordered /
            Cancelled) and voiding a PO aren't built yet — this is tracking only.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body stack">
          <label className="field" style={{ margin: 0 }}>
            <span>Search — artist, title, catalog no., UPC, PO, or supplier</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="try: blue · PO-1042 · F.A.B."
            />
          </label>
          <BarcodeInput onScan={doScan} placeholder="…or scan a barcode to filter directly" samples={SAMPLE_CODES} />
          <div className="row wrap" style={{ gap: "var(--sp-3)" }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Sort</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="age">Age (oldest first)</option>
                <option value="title">Title</option>
                <option value="artist">Artist</option>
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Filter — supplier</span>
              <select
                value={supplierFilter}
                onChange={(e) => {
                  setSupplierFilter(e.target.value);
                  setPoFilter("");
                }}
              >
                <option value="">All suppliers</option>
                {suppliersOnOrder.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} ({sup.shortName})
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Filter — PO</span>
              <select value={poFilter} onChange={(e) => setPoFilter(e.target.value)}>
                <option value="">All POs</option>
                {posOnOrder.map((po) => (
                  <option key={po} value={po}>
                    {po}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {statusMsg && <div className="callout ok">{statusMsg}</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          On order
          <span className="muted xsmall">{rows.length} line{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th className="num">Age</th>
                <th>Item</th>
                <th>Supplier</th>
                <th>PO</th>
                <th className="num">Qty</th>
                <th className="num">Sell price</th>
                <th>Customer</th>
                <th>Follow-up</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => {
                const rec = app.recordFor(line.recordId);
                const sup = app.supplierFor(line.supplierId);
                const cust = app.customerFor(line.customerId);
                const overdue = isFollowUpOverdue(line);
                const due = followUpDueAt(line);
                return (
                  <tr key={line.id} className={overdue ? "overdue" : undefined}>
                    <td className="num">{daysAgo(line.createdAt)}d</td>
                    <td>{rec ? `${rec.artist} — ${rec.title}` : line.recordId}</td>
                    <td>
                      {sup?.name} <span className="mono xsmall muted">({sup?.shortName})</span>
                    </td>
                    <td className="mono small">{line.poNumber}</td>
                    <td className="num">{line.qty}</td>
                    <td className="num">{money(line.sellPrice)}</td>
                    <td className="small">{cust ? cust.name : "—"}</td>
                    <td>
                      {due == null ? (
                        <span className="muted small">— none set —</span>
                      ) : overdue ? (
                        <span className="badge danger">
                          Overdue {Math.floor((Date.now() - due) / 86400000)}d
                        </span>
                      ) : (
                        <span className="small muted">Due in {Math.ceil((due - Date.now()) / 86400000)}d</span>
                      )}
                    </td>
                    <td className="num">
                      <button className="btn sm" onClick={() => setReflagTarget(line)}>
                        Re-flag
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="small muted">
                    Nothing on order{query || supplierFilter || poFilter ? " matching these filters" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reflagTarget && (
        <ReflagModal
          line={reflagTarget}
          onClose={() => setReflagTarget(null)}
          onDone={(msg) => {
            setReflagTarget(null);
            setStatusMsg(msg);
          }}
        />
      )}
    </div>
  );
}

function ReflagModal({
  line,
  onClose,
  onDone,
}: {
  line: PendingOrderLine;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const app = useApp();
  const rec = app.recordFor(line.recordId);
  const [days, setDays] = useState(line.followUpDays ?? 7);
  const title = rec ? `${rec.artist} — ${rec.title}` : line.recordId;

  const commit = () => {
    app.reflagPendingOrderLine(line.id, Math.max(0, days));
    onDone(`${title} re-flagged — will chase again in ${days} day${days === 1 ? "" : "s"} from today.`);
  };

  return (
    <Modal
      title={`Re-flag — ${title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={commit}>
            Re-flag
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Pushes the follow-up date out another <em>n</em> days from today — used both to chase the
          supplier and to warn a waiting customer. <em>(M-02 §"Tracking what's on order".)</em>
        </p>
        {line.customerId && (
          <div className="callout small">{app.customerFor(line.customerId)?.name ?? "A customer"} is waiting on this line.</div>
        )}
        <label className="field">
          <span>Chase again in (days)</span>
          <input
            className="inline-num"
            type="number"
            min={0}
            value={days}
            onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
      </div>
    </Modal>
  );
}
