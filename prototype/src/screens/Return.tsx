import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { GRADES, type Grade } from "../data/types";
import { money } from "../lib/money";
import { balanceDue, saleTotals } from "../lib/totals";
import { useApp } from "../store/AppStore";

// Entered exclusively from E-05 Point of Sale → + New Return (mirrors how
// /sell/:saleId is never itself a nav item). A Return is a Sale with isReturn set, so a
// stray /sell/:id link to one, or a /return/:id link to an ordinary Sale,
// redirects to the screen that actually knows how to edit it.
export function ReturnScreen() {
  const app = useApp();
  const nav = useNavigate();
  const { saleId } = useParams<{ saleId: string }>();
  const sale = app.sales.find((s) => s.id === saleId);

  useEffect(() => {
    if (sale && !sale.isReturn) nav(`/sell/${sale.id}`, { replace: true });
  }, [sale, nav]);

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">E-06</span>
        <div>
          <h1>Process a return</h1>
          <p className="sub">
            A Return is a <strong>negative-quantity line</strong> on a Sale — not a separate
            document. No receipt, no time window, no manager approval. Refund and stock disposition
            are recorded independently.
          </p>
        </div>
      </div>

      {!sale && <p className="muted">Unknown Return — start one from E-05 Point of Sale → + New Return.</p>}
      {sale && sale.isReturn && (
        <ReturnEditor
          saleId={sale.id}
          onRestart={() => nav(`/return/${app.newSale({ isReturn: true })}`)}
        />
      )}
    </div>
  );
}

function ReturnEditor({ saleId, onRestart }: { saleId: string; onRestart: () => void }) {
  const app = useApp();
  const sale = app.sales.find((s) => s.id === saleId)!;
  const totals = saleTotals(sale, app.taxLines);
  const due = balanceDue(sale, app.taxLines);
  const customer = app.customerFor(sale.customerId);

  const [addItem, setAddItem] = useState(false);
  const [routeItem, setRouteItem] = useState<{ lineId: string; itemId: string } | null>(null);
  const [receipt, setReceipt] = useState(false);

  const unroutedCopies = useMemo(
    () => sale.lines.filter((l) => l.qty < 0 && l.inventoryItemId && !l.stockRouted).length,
    [sale.lines],
  );

  return (
    <div className="sell">
      <div className="stack">
        <div className="card">
          <div className="card-head">
            Return {sale.saleNumber ? `#${sale.saleNumber}` : <span className="badge">Draft</span>}
            <button className="btn ghost sm" onClick={onRestart}>
              start another
            </button>
          </div>
          <div className="card-body stack">
            <div className="row wrap">
              <CustomerAttach saleId={sale.id} />
              {customer && <span className="badge ok">balance {money(customer.balance)}</span>}
            </div>
            <button className="btn" disabled={!!sale.saleNumber} onClick={() => setAddItem(true)}>
              + Add returned item
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">Lines</div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Refund</th>
                  <th>Link</th>
                  <th className="num">Net</th>
                  <th>Stock routed?</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((l) => {
                  const routed = !!l.stockRouted;
                  return (
                    <tr key={l.id}>
                      <td>
                        {l.title}
                        {l.grade && <> · <span className="badge grade">{l.grade}</span></>}
                        <div className="xsmall muted">{l.note}</div>
                      </td>
                      <td className="num">{l.qty}</td>
                      <td className="num">
                        <input
                          className="inline-num"
                          type="number"
                          step="0.01"
                          value={l.price}
                          disabled={!!sale.saleNumber}
                          onChange={(e) => app.updateLine(sale.id, l.id, { price: Number(e.target.value) })}
                        />
                      </td>
                      <td className="small">{l.linkedSaleNumber ? `#${l.linkedSaleNumber}` : "—"}</td>
                      <td className="num">{money(l.qty * l.price)}</td>
                      <td>
                        {l.inventoryItemId ? (
                          routed ? (
                            <span className="badge ok">{l.routedTo}</span>
                          ) : (
                            <button
                              className="btn sm"
                              onClick={() => setRouteItem({ lineId: l.id, itemId: l.inventoryItemId! })}
                            >
                              Route stock →
                            </button>
                          )
                        ) : (
                          <span className="muted xsmall">n/a</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sale.lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted small">
                      No returned items yet.
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
            {sale.log.map((e, i) => (
              <div key={i}>
                <span className="mono">{e.at}</span> — {e.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">Refund</div>
          <div className="card-body">
            <div className="totals-row">
              <span>Subtotal</span>
              <span className="num">{money(totals.subtotal)}</span>
            </div>
            <div className="totals-row">
              <span>Tax</span>
              <span className="num">{money(totals.tax)}</span>
            </div>
            <div className="totals-row grand">
              <span>Refund due</span>
              <span className="num">{money(Math.abs(totals.grand))}</span>
            </div>
            {sale.tenders.map((t) => (
              <div key={t.id} className="tender-line">
                <span>{t.type}</span>
                <span className="num">{money(t.amount)}</span>
              </div>
            ))}
            <div className="totals-row grand">
              <span>{Math.abs(due) < 0.001 ? "Settled" : "Unsettled"}</span>
              <span className="num">{money(Math.abs(due))}</span>
            </div>
          </div>
          {!sale.saleNumber && sale.lines.length > 0 && (
            <div className="card-body btn-row">
              <button
                className="btn"
                onClick={() =>
                  app.addTender(sale.id, { type: "Cash", amount: totals.grand, note: "Refund paid from till" })
                }
              >
                Refund to cash
              </button>
              <button
                className="btn"
                disabled={!customer}
                title={customer ? "" : "Requires a Customer"}
                onClick={() =>
                  app.addTender(sale.id, { type: "Account Balance", amount: totals.grand, note: "Refund to account balance" })
                }
              >
                Refund to account balance
              </button>
            </div>
          )}
        </div>

        {!sale.saleNumber && (
          <div className="card">
            <div className="card-body btn-row">
              <button
                className="btn primary lg"
                disabled={sale.lines.length === 0 || Math.abs(due) > 0.001 || unroutedCopies > 0}
                onClick={() => {
                  app.completeSale(sale.id);
                  setReceipt(true);
                }}
              >
                Finish return
              </button>
            </div>
            <div className="card-body xsmall muted">
              Returned stock isn’t back on the shelf until routed (E-06 step 6). Refund amount and
              disposition are independent — full refund + write-off is a valid combination.
              {unroutedCopies > 0 && (
                <div className="callout" style={{ marginTop: 4 }}>
                  {unroutedCopies} returned cop{unroutedCopies > 1 ? "ies" : "y"} still need routing.
                </div>
              )}
              {Math.abs(due) > 0.001 && (
                <div className="callout" style={{ marginTop: 4 }}>
                  Refund not yet tendered — choose “Refund to cash” or “account balance” above.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {addItem && <AddReturnedItem saleId={sale.id} onClose={() => setAddItem(false)} />}
      {routeItem && (
        <RouteStock
          saleId={sale.id}
          lineId={routeItem.lineId}
          itemId={routeItem.itemId}
          onClose={() => setRouteItem(null)}
        />
      )}
      {receipt && (
        <Modal title="Return complete" onClose={() => setReceipt(false)} foot={<button className="btn primary" onClick={() => setReceipt(false)}>Done</button>}>
          <div className="callout ok">
            Return tendered as negative amounts against their tender — they flow into the M-03 close
            as negatives, not netted into gross sales (E-06 decision 8).
          </div>
        </Modal>
      )}
    </div>
  );
}

function CustomerAttach({ saleId }: { saleId: string }) {
  const app = useApp();
  const sale = app.sales.find((s) => s.id === saleId)!;
  const c = app.customerFor(sale.customerId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)} disabled={!!sale.saleNumber}>
        {c ? `Customer: ${c.name}` : "Attach customer (optional)"}
      </button>
      {open && (
        <Modal title="Attach customer" onClose={() => setOpen(false)}>
          <table className="data">
            <tbody>
              {app.customers.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td className="num">
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        app.attachCustomer(saleId, x.id);
                        setOpen(false);
                      }}
                    >
                      Attach
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </>
  );
}

function AddReturnedItem({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const app = useApp();
  const copies = app.inventory;
  const [itemId, setItemId] = useState(copies[0]?.id ?? "");
  const item = app.itemFor(itemId)!;
  const record = app.recordFor(item?.recordId);

  // candidate prior Sales to link against (E-06 step 3)
  const priorSales = app.sales.filter(
    (s) => s.saleNumber && s.lines.some((l) => l.recordId === item?.recordId && l.qty > 0),
  );
  const [link, setLink] = useState<string>("");
  const linkedSale = priorSales.find((s) => String(s.saleNumber) === link);
  const linkedLine = linkedSale?.lines.find((l) => l.recordId === item?.recordId);
  const defaultRefund = linkedLine ? linkedLine.price * (1 - linkedLine.discountPct / 100) : item?.price ?? 0;
  const [refund, setRefund] = useState<string>(String(defaultRefund.toFixed(2)));

  return (
    <Modal
      title="Add returned item"
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              app.addReturnLine(
                saleId,
                item,
                Number(refund) || 0,
                linkedSale?.saleNumber,
              );
              onClose();
            }}
          >
            Add return line
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Scan / select the copy</span>
          <select
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value);
              setLink("");
              const it = app.itemFor(e.target.value);
              setRefund(String((it?.price ?? 0).toFixed(2)));
            }}
          >
            {copies.map((c) => {
              const r = app.recordFor(c.recordId);
              return (
                <option key={c.id} value={c.id}>
                  {r?.artist} — {r?.title} · {c.grade} · {c.internalBarcode}
                </option>
              );
            })}
          </select>
        </label>

        <label className="field">
          <span>Link to a prior Sale — when possible, never required (E-06 decision 2)</span>
          <select
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              const s = priorSales.find((x) => String(x.saleNumber) === e.target.value);
              const ll = s?.lines.find((l) => l.recordId === item?.recordId);
              if (ll) setRefund(String((ll.price * (1 - ll.discountPct / 100)).toFixed(2)));
            }}
          >
            <option value="">No link — no receipt / walk-in / gift</option>
            {priorSales.map((s) => (
              <option key={s.id} value={String(s.saleNumber)}>
                #{s.saleNumber} · {app.customerFor(s.customerId)?.name ?? "walk-in"} ·{" "}
                {new Date(s.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>
            Refund amount — defaults to {linkedLine ? "the linked line price" : "the item’s current price"},
            overridable (E-06 decision 5)
          </span>
          <input type="number" step="0.01" value={refund} onChange={(e) => setRefund(e.target.value)} />
        </label>

        <div className="callout">
          {record?.artist} — {record?.title}. After tendering the refund you’ll route this copy:
          back to sellable, re-graded as its own InventoryItem, or written off.
        </div>
      </div>
    </Modal>
  );
}

function RouteStock({
  saleId,
  lineId,
  itemId,
  onClose,
}: {
  saleId: string;
  lineId: string;
  itemId: string;
  onClose: () => void;
}) {
  const app = useApp();
  const item = app.itemFor(itemId)!;
  const [mode, setMode] = useState<"sellable" | "regrade" | "writeoff">("sellable");
  const [grade, setGrade] = useState<Grade>(item.grade);
  const [price, setPrice] = useState(String(item.price));

  return (
    <Modal
      title="Route the returned copy (E-06 step 6)"
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              app.routeReturnLine(
                saleId,
                lineId,
                itemId,
                mode,
                mode === "regrade" ? grade : undefined,
                mode === "regrade" ? Number(price) || 0 : undefined,
              );
              onClose();
            }}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="row">
          <input type="radio" checked={mode === "sellable"} onChange={() => setMode("sellable")} />
          <span>
            <strong>Back to sellable</strong> at its original grade ({item.grade}) — came back as it left.
          </span>
        </label>
        <label className="row">
          <input type="radio" checked={mode === "regrade"} onChange={() => setMode("regrade")} />
          <span>
            <strong>Re-grade</strong> — take it in as an InventoryItem with its own grade and price.
          </span>
        </label>
        {mode === "regrade" && (
          <div className="row" style={{ paddingLeft: 24 }}>
            <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <input className="inline-num" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        )}
        <label className="row">
          <input type="radio" checked={mode === "writeoff"} onChange={() => setMode("writeoff")} />
          <span>
            <strong>Write off</strong> — not sellable at all; reason-coded adjustment (E-04).
          </span>
        </label>
      </div>
    </Modal>
  );
}
