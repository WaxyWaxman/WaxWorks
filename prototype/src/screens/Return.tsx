import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { TillRail } from "../components/TillRail";
import { VoidSaleModal } from "../components/VoidSaleModal";
import { GRADES, type Grade } from "../data/types";
import { money } from "../lib/money";
import { balanceDue, saleTotals } from "../lib/totals";
import { useApp } from "../store/AppStore";

// Entered exclusively from the till rail's + New return (mirrors how
// /sell/:saleId is never itself a nav item). A Return is a Sale with isReturn
// set, so a stray /sell/:id link to one, or a /return/:id link to an ordinary
// Sale, redirects to the screen that actually knows how to edit it.
//
// E-06 d9 — the same three tracks as the till (E-05 d29): the rail, the
// Return, and the money, each scrolling on its own with Finish return pinned
// to the money's floor. A Return is a till transaction, so the rail follows
// you into it rather than stranding you on a screen with no way back to a
// Sale in flight.
export function ReturnScreen() {
  const app = useApp();
  const nav = useNavigate();
  const { saleId } = useParams<{ saleId: string }>();
  const sale = app.sales.find((s) => s.id === saleId);

  useEffect(() => {
    if (sale && !sale.isReturn) nav(`/sell/${sale.id}`, { replace: true });
  }, [sale, nav]);

  return (
    <div className="till-frame">
      <TillRail activeSaleId={sale?.id} />

      {sale && sale.isReturn ? (
        <ReturnEditor key={sale.id} saleId={sale.id} />
      ) : (
        <div className="till-nosale">
          <div className="stack">
            <div className="lab">Unknown return</div>
            <p className="muted">Start one from the rail.</p>
            <button
              className="btn primary"
              onClick={() => nav(`/return/${app.newSale({ isReturn: true })}`)}
            >
              + New return
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReturnEditor({ saleId }: { saleId: string }) {
  const app = useApp();
  const sale = app.sales.find((s) => s.id === saleId)!;
  const totals = saleTotals(sale, app.taxLines);
  const due = balanceDue(sale, app.taxLines);
  const customer = app.customerFor(sale.customerId);

  const [addItem, setAddItem] = useState(false);
  const [routeItem, setRouteItem] = useState<{ lineId: string; itemId: string } | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const unroutedCopies = useMemo(
    () => sale.lines.filter((l) => l.qty < 0 && l.inventoryItemId && !l.stockRouted).length,
    [sale.lines],
  );

  const finished = !!sale.saleNumber;
  const latestLog = sale.log.length ? sale.log[sale.log.length - 1] : null;

  return (
    <>
      {/* ---- the return ---- */}
      <section className="till-main">
        <div className="till-sale-head">
          <span className="sale-head-label">Return</span>
          <CustomerAttach saleId={sale.id} />
          <span className="sale-head-meta">
            {finished ? (
              <>
                #{sale.saleNumber}{" "}
                <span className={"badge" + (sale.state === "Closed" ? "" : " ok")}>{sale.state}</span>
              </>
            ) : sale.state === "Void" ? (
              <span className="badge warn">Void</span>
            ) : (
              <span className="badge">Draft</span>
            )}
          </span>
          <span className="muted xsmall">
            {sale.lines.length} line{sale.lines.length !== 1 ? "s" : ""}
          </span>

          <span className="till-sale-acts">
            {(sale.state === "Open" || sale.state === "Current") && (
              <button className="btn danger sm" onClick={() => setVoiding(true)}>
                Void return
              </button>
            )}
          </span>
        </div>

        <div className="till-sale-meta">
          {customer && (
            <span className={"badge " + (customer.balance >= 0 ? "ok" : "warn")}>
              balance {money(customer.balance)}
            </span>
          )}
          <span className="muted xsmall">
            A Return is a negative-quantity line on a Sale — no receipt, no time window, no manager
            approval. Refund and stock disposition are recorded independently.
          </span>
        </div>

        {/* Where the till puts its scan field: the way a line gets onto this
            document. The copy, the prior Sale it links to and the refund are
            settled together, so it opens a form rather than resolving a scan
            straight onto the Return. */}
        {!finished && (
          <div className="till-scan">
            <button className="btn primary till-add-return" onClick={() => setAddItem(true)}>
              + Add returned item
            </button>
          </div>
        )}

        <div className="till-lines">
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
                      {l.grade && (
                        <>
                          {" · "}
                          <span className="badge grade">{l.grade}</span>
                        </>
                      )}
                      <div className="xsmall muted">{l.note}</div>
                    </td>
                    <td className="num">{l.qty}</td>
                    <td className="num">
                      <input
                        className="inline-num"
                        type="number"
                        step="0.01"
                        value={l.price}
                        disabled={finished}
                        onChange={(e) =>
                          app.updateLine(sale.id, l.id, { price: Number(e.target.value) })
                        }
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

        <details className="till-log">
          <summary>
            <span className="till-log-top">
              <span className="lab">Log &amp; notes ({sale.log.length})</span>
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
            {sale.log.map((e, i) => (
              <div key={i}>
                <span className="mono">{e.at}</span> — {e.text}
              </div>
            ))}
          </div>
          <div className="btn-row">
            <input
              type="text"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note…"
              style={{ flex: 1 }}
            />
            <button
              className="btn sm"
              disabled={!noteDraft.trim()}
              onClick={() => {
                app.addLog(sale.id, noteDraft.trim());
                setNoteDraft("");
              }}
            >
              Add note
            </button>
          </div>
        </details>
      </section>

      {/* ---- the money ---- */}
      <aside className="till-money">
        <div className="till-money-head">
          <div className="lab">Refund due</div>
          <div className="till-due">{money(Math.abs(totals.grand))}</div>
          <div className="xsmall muted till-due-sub">
            Subtotal {money(Math.abs(totals.subtotal))} · tax {money(Math.abs(totals.tax))}
          </div>
        </div>

        <div className="till-rule" />

        <div className="till-money-mid">
          {!finished && sale.lines.length > 0 && (
            <div>
              <div className="lab" style={{ marginBottom: "var(--sp-2)" }}>
                Give the refund
              </div>
              <div className="tender-grid">
                <button
                  className="btn"
                  onClick={() =>
                    app.addTender(sale.id, {
                      type: "Cash",
                      amount: totals.grand,
                      note: "Refund paid from till",
                    })
                  }
                >
                  Cash
                </button>
                <button
                  className="btn"
                  disabled={!customer}
                  title={customer ? "" : "Requires a Customer"}
                  onClick={() =>
                    app.addTender(sale.id, {
                      type: "Account Balance",
                      amount: totals.grand,
                      accountDirection: "add",
                      note: "Refund to account balance",
                    })
                  }
                >
                  Account balance
                </button>
              </div>
            </div>
          )}

          {sale.tenders.length > 0 && (
            <div className="till-taken">
              {sale.tenders.map((t) => (
                <div key={t.id} className="tender-line">
                  <span>
                    {t.type}
                    {t.note ? <span className="muted"> — {t.note}</span> : ""}
                  </span>
                  <span className="row">
                    <span className="num">{money(t.amount)}</span>
                    {!finished && (
                      <button
                        className="btn ghost sm"
                        onClick={() => app.removeTender(sale.id, t.id)}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>
              ))}
              <div className="totals-row grand">
                <span style={{ color: Math.abs(due) > 0.001 ? "var(--c-accent)" : undefined }}>
                  {Math.abs(due) < 0.001 ? "Settled" : "Unsettled"}
                </span>
                <span
                  className="num"
                  style={{ color: Math.abs(due) > 0.001 ? "var(--c-accent)" : undefined }}
                >
                  {money(Math.abs(due))}
                </span>
              </div>
            </div>
          )}

          {!finished && (
            <div className="xsmall muted">
              Returned stock isn't back on the shelf until routed (E-06 step 6). Refund amount and
              disposition are independent — full refund + write-off is a valid combination.
            </div>
          )}
          {!finished && unroutedCopies > 0 && (
            <div className="callout">
              {unroutedCopies} returned cop{unroutedCopies > 1 ? "ies" : "y"} still{" "}
              {unroutedCopies > 1 ? "need" : "needs"} routing.
            </div>
          )}
          {!finished && sale.lines.length > 0 && Math.abs(due) > 0.001 && (
            <div className="callout">Refund not yet given — Cash or Account balance above.</div>
          )}
          {finished && (
            <div className="xsmall muted">
              Tendered as negative amounts against their tender — they flow into the M-03 close as
              negatives, not netted into gross sales (E-06 decision 8).
            </div>
          )}
        </div>

        {!finished && (
          <div className="till-money-foot">
            <button
              className="btn primary till-finish"
              disabled={sale.lines.length === 0 || Math.abs(due) > 0.001 || unroutedCopies > 0}
              onClick={() => {
                app.completeSale(sale.id);
                setReceipt(true);
              }}
            >
              FINISH RETURN
            </button>
          </div>
        )}
      </aside>

      {addItem && <AddReturnedItem saleId={sale.id} onClose={() => setAddItem(false)} />}
      {routeItem && (
        <RouteStock
          saleId={sale.id}
          lineId={routeItem.lineId}
          itemId={routeItem.itemId}
          onClose={() => setRouteItem(null)}
        />
      )}
      {voiding && (
        <VoidSaleModal sale={sale} mode="void" onClose={() => setVoiding(false)} onDone={() => setVoiding(false)} />
      )}
      {receipt && (
        <Modal
          title="Return complete"
          onClose={() => setReceipt(false)}
          foot={
            <button className="btn primary" onClick={() => setReceipt(false)}>
              Done
            </button>
          }
        >
          <div className="callout ok">
            Return tendered as negative amounts against their tender — they flow into the M-03 close
            as negatives, not netted into gross sales (E-06 decision 8).
          </div>
        </Modal>
      )}
    </>
  );
}

function CustomerAttach({ saleId }: { saleId: string }) {
  const app = useApp();
  const sale = app.sales.find((s) => s.id === saleId)!;
  const c = app.customerFor(sale.customerId);
  const [open, setOpen] = useState(false);
  return (
    <>
      {c ? (
        <button
          className="sale-head-customer-btn"
          onClick={() => setOpen(true)}
          disabled={!!sale.saleNumber}
          title="Change customer"
        >
          {c.name}
        </button>
      ) : (
        <button className="btn sm" onClick={() => setOpen(true)} disabled={!!sale.saleNumber}>
          + Add customer
        </button>
      )}
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
