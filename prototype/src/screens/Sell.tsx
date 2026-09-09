import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarcodeInput } from "../components/BarcodeInput";
import { Modal } from "../components/Modal";
import type { InventoryItem, RecordEntry, SaleLine, TenderType } from "../data/types";
import { resolveScan } from "../lib/resolve";
import { money } from "../lib/money";
import { availableOnHand, balanceDue, saleTotals, tenderedTotal } from "../lib/totals";
import { useApp } from "../store/AppStore";

const TENDERS: TenderType[] = ["Cash", "Credit Card", "Store Credit", "Gift Card", "Pay-out", "Used Credit"];

export function Sell() {
  const app = useApp();
  const nav = useNavigate();
  const { saleId } = useParams();

  useEffect(() => {
    if (saleId && saleId !== app.activeSaleId) app.setActiveSale(saleId);
  }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sale = app.activeSale;
  const openSales = app.sales.filter((s) => s.state === "Current" && !s.saleNumber);
  const heldSales = app.sales.filter((s) => s.state === "Held");

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">E-05</span>
        <div>
          <h1>Sell a record</h1>
          <p className="sub">Ring up a Sale and take payment. Split tender, holds, negative inventory, gift cards.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body row wrap">
          <button className="btn primary" onClick={() => nav(`/sell/${app.newSale()}`)}>
            + New Sale
          </button>
          <button className="btn" onClick={() => nav(`/sell/${app.newSale({ isReturn: true })}`)}>
            + New Return
          </button>
          <span className="muted xsmall">Open:</span>
          {openSales.length === 0 && <span className="xsmall muted">none</span>}
          {openSales.map((s) => (
            <button
              key={s.id}
              className={"btn sm" + (s.id === sale?.id ? " primary" : "")}
              onClick={() => nav(`/sell/${s.id}`)}
            >
              {s.isReturn ? "Return" : "Sale"} · {s.lines.length} line{s.lines.length !== 1 ? "s" : ""}
            </button>
          ))}
          <span className="muted xsmall">Held:</span>
          {heldSales.map((s) => (
            <button
              key={s.id}
              className={"btn sm" + (s.id === sale?.id ? " primary" : "")}
              onClick={() => nav(`/sell/${s.id}`)}
            >
              {s.holdRef} · {app.customerFor(s.customerId)?.name?.split(" ")[0] ?? "—"}
            </button>
          ))}
        </div>
      </div>

      {!sale && <div className="callout">Start a new Sale or pick one above.</div>}
      {sale && <SaleEditor key={sale.id} />}
    </div>
  );
}

function SaleEditor() {
  const app = useApp();
  const sale = app.activeSale!;
  const totals = saleTotals(sale, app.taxLines);
  const due = balanceDue(sale, app.taxLines);
  const customer = app.customerFor(sale.customerId);

  const [picker, setPicker] = useState<{ record: RecordEntry; items: InventoryItem[] } | null>(null);
  const [negPrompt, setNegPrompt] = useState<RecordEntry | null>(null);
  const [ntPrompt, setNtPrompt] = useState<{ code: string; label: string; price: number } | null>(null);
  const [gcLoad, setGcLoad] = useState<string | null>(null);
  const [gcRedeem, setGcRedeem] = useState<{ code: string; balance: number } | null>(null);
  const [showTender, setShowTender] = useState(false);
  const [custPick, setCustPick] = useState(false);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const locked = sale.state === "Void" || !!sale.saleNumber;

  const onScan = (code: string) => {
    setScanNote(null);
    const res = resolveScan(code, app);
    switch (res.kind) {
      case "internal":
      case "upc-single":
        app.addItemLine(sale.id, res.item);
        setScanNote(`Added ${res.record.title} (${res.item.grade}) at ${money(res.item.price)}.`);
        break;
      case "upc-multi":
        if (res.items.length === 0) setNegPrompt(res.record);
        else setPicker({ record: res.record, items: res.items });
        break;
      case "nontracked":
        if (res.item.price === 0) setNtPrompt({ code: res.item.code, label: res.item.label, price: 0 });
        else app.addNonTrackedLine(sale.id, res.item, res.item.price);
        break;
      case "giftcard":
        if (res.card.balance === 0) setGcLoad(res.card.code);
        else setGcRedeem({ code: res.card.code, balance: res.card.balance });
        break;
      default:
        setScanNote(`No match for “${res.input}”.`);
    }
  };

  return (
    <div className="sell">
      <div className="stack">
        <div className="card">
          <div className="card-head">
            {sale.isReturn ? "Return" : "Sale"} —{" "}
            {sale.saleNumber ? (
              <>#{sale.saleNumber} <span className="badge ok">Tendered</span></>
            ) : sale.state === "Held" ? (
              <>
                <span className="mono">{sale.holdRef}</span> <span className="badge">Held</span>
              </>
            ) : (
              <span className="badge">Current</span>
            )}
            <span className="muted xsmall">{sale.createdBy}</span>
          </div>
          <div className="card-body stack">
            <div className="row wrap">
              <button className="btn sm" onClick={() => setCustPick(true)} disabled={locked}>
                {customer ? `Customer: ${customer.name}` : "Attach customer"}
              </button>
              {customer && (
                <>
                  <span className="badge accent">disc {customer.globalDiscountPct}%</span>
                  {customer.defaultTaxLineId && (
                    <span className="badge accent">
                      tax → {app.taxLines.find((t) => t.id === customer.defaultTaxLineId)?.name}
                    </span>
                  )}
                  <span className={"badge " + (customer.balance >= 0 ? "ok" : "warn")}>
                    balance {money(customer.balance)}
                  </span>
                  <button className="btn ghost sm" onClick={() => app.attachCustomer(sale.id, null)} disabled={locked}>
                    detach
                  </button>
                </>
              )}
            </div>

            {!locked && <BarcodeInput onScan={onScan} />}
            {scanNote && <div className="callout ok">{scanNote}</div>}
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
                  <th className="num">Price</th>
                  <th className="num">Disc %</th>
                  <th>Tax line</th>
                  <th className="num">Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((l) => (
                  <LineRow key={l.id} line={l} locked={locked} />
                ))}
                {sale.lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted small">
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
            {sale.log.map((e, i) => (
              <div key={i}>
                <span className="mono">{e.at}</span> — {e.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- right rail ---- */}
      <div className="stack">
        <div className="card">
          <div className="card-head">Totals</div>
          <div className="card-body">
            <div className="totals-row">
              <span>Subtotal</span>
              <span className="num">{money(totals.subtotal)}</span>
            </div>
            <div className="totals-row">
              <span>Discount given</span>
              <span className="num">-{money(totals.discount)}</span>
            </div>
            <div className="totals-row">
              <span>Tax</span>
              <span className="num">{money(totals.tax)}</span>
            </div>
            <div className="totals-row grand">
              <span>{totals.grand < 0 ? "Refund due" : "Total"}</span>
              <span className="num">{money(totals.grand)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            Tenders
            <span className="muted xsmall">tendered {money(tenderedTotal(sale))}</span>
          </div>
          <div className="card-body">
            {sale.tenders.map((t) => (
              <div key={t.id} className="tender-line">
                <span>
                  {t.type}
                  {t.reference ? ` · ${t.reference}` : ""}
                  {t.note ? <span className="muted"> — {t.note}</span> : ""}
                </span>
                <span className="row">
                  <span className="num">{money(t.amount)}</span>
                  {!locked && (
                    <button className="btn ghost sm" onClick={() => app.removeTender(sale.id, t.id)}>
                      ✕
                    </button>
                  )}
                </span>
              </div>
            ))}
            <div className="totals-row grand">
              <span>{due > 0 ? "Balance due" : due < 0 ? "Change / owed" : "Settled"}</span>
              <span className="num">{money(Math.abs(due))}</span>
            </div>
            {!locked && (
              <div className="btn-row" style={{ marginTop: "var(--sp-3)" }}>
                <button className="btn" onClick={() => setShowTender(true)}>
                  Add tender
                </button>
              </div>
            )}
          </div>
        </div>

        {!locked && (
          <div className="card">
            <div className="card-body btn-row">
              <button
                className="btn primary lg"
                disabled={sale.lines.length === 0 || Math.abs(due) > 0.001}
                onClick={() => setReceipt(app.completeSale(sale.id))}
              >
                Tender &amp; finish
              </button>
              {sale.state !== "Held" && (
                <button
                  className="btn"
                  disabled={sale.lines.length === 0}
                  onClick={() => app.holdSale(sale.id)}
                >
                  Hold
                </button>
              )}
              {sale.state === "Held" && (
                <button className="btn danger" onClick={() => app.cancelHold(sale.id)}>
                  Cancel hold
                </button>
              )}
              <button className="btn danger" onClick={() => app.voidSale(sale.id)}>
                Void
              </button>
            </div>
            {due < -0.001 && sale.tenders.some((t) => t.type === "Cash") && (
              <div className="card-body">
                <div className="callout ok">Change owed: {money(Math.abs(due))}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- modals ---- */}
      {picker && (
        <Modal title={`Which copy? — ${picker.record.title}`} onClose={() => setPicker(null)}>
          <p className="small">
            The manufacturer UPC matched more than one sellable copy at different condition/price.
            Pick the one on the counter. <em>(E-05 decision 18.)</em>
          </p>
          <table className="data">
            <tbody>
              {picker.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <span className="badge grade">{i.grade}</span> {i.backroom && <span className="badge warn">Backroom</span>}
                  </td>
                  <td className="mono small">{i.internalBarcode}</td>
                  <td className="num">{money(i.price)}</td>
                  <td className="num">
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        app.addItemLine(sale.id, i);
                        setPicker(null);
                      }}
                    >
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {negPrompt && (
        <PricePrompt
          title={`No copy on hand — ${negPrompt.title}`}
          help="No sellable copy exists yet (its Invoice may not be finalized). The till completes the Sale and lets inventory go negative — reconciled later in E-04. Enter the counter price."
          defaultValue={negPrompt.stickyPrice ?? 0}
          onCancel={() => setNegPrompt(null)}
          onConfirm={(p) => {
            app.addNegInventoryLine(sale.id, negPrompt, p);
            setNegPrompt(null);
          }}
        />
      )}

      {ntPrompt && (
        <PricePrompt
          title={`Price — ${ntPrompt.label}`}
          help="A price of 0.00 means ask at the till (E-05 decision 11). Non-tracked items never warn on negative inventory."
          defaultValue={0}
          onCancel={() => setNtPrompt(null)}
          onConfirm={(p) => {
            app.addNonTrackedLine(sale.id, { code: ntPrompt.code, label: ntPrompt.label, price: p, section: "MERCH" }, p);
            setNtPrompt(null);
          }}
        />
      )}

      {gcLoad && (
        <PricePrompt
          title={`Load gift card ${gcLoad}`}
          help="This card carries no balance. Loading it adds a line item to the Sale for the value purchased (money in) — E-05 decision 10."
          defaultValue={25}
          onCancel={() => setGcLoad(null)}
          onConfirm={(v) => {
            app.addGiftCardLoadLine(sale.id, gcLoad, v);
            setGcLoad(null);
          }}
        />
      )}

      {gcRedeem && (
        <Modal
          title={`Redeem gift card ${gcRedeem.code}`}
          onClose={() => setGcRedeem(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setGcRedeem(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const amt = Math.min(gcRedeem.balance, Math.max(0, due));
                  app.addTender(sale.id, { type: "Gift Card", amount: amt, reference: gcRedeem.code });
                  setGcRedeem(null);
                }}
              >
                Redeem {money(Math.min(gcRedeem.balance, Math.max(0, due)))}
              </button>
            </>
          }
        >
          <p className="small">
            Balance {money(gcRedeem.balance)}. Redemption is a <strong>tender</strong>, not a
            line-item discount, so it composes with split tender (E-05 decision 10).
          </p>
        </Modal>
      )}

      {custPick && (
        <Modal title="Attach customer" onClose={() => setCustPick(false)}>
          <p className="small">Lookup by name, phone, or email. A Sale without a Customer is normal (E-05 decision 20).</p>
          <table className="data">
            <tbody>
              {app.customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    <div className="xsmall muted">
                      {c.accountType} · {c.accountNumber} · {c.phone}
                    </div>
                  </td>
                  <td className="num">{money(c.balance)}</td>
                  <td className="num">
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        app.attachCustomer(sale.id, c.id);
                        setCustPick(false);
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

      {showTender && (
        <TenderModal
          due={due}
          hasCustomer={!!customer}
          onClose={() => setShowTender(false)}
          onAdd={(t) => {
            app.addTender(sale.id, t);
            setShowTender(false);
          }}
        />
      )}

      {receipt !== null && (
        <Modal
          title="Print receipt?"
          onClose={() => setReceipt(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setReceipt(null)}>
                Skip
              </button>
              <button className="btn" onClick={() => setReceipt(null)}>
                Email
              </button>
              <button className="btn primary" onClick={() => setReceipt(null)}>
                Print
              </button>
            </>
          }
        >
          <div className="callout ok">
            Tendered. Sale number <strong>#{receipt}</strong> assigned. Any Sale can be reopened by
            number to reprint or email its receipt (E-05 decision 19).
          </div>
        </Modal>
      )}
    </div>
  );
}

function LineRow({ line, locked }: { line: SaleLine; locked: boolean }) {
  const app = useApp();
  const sale = app.activeSale!;
  const rec = app.recordFor(line.recordId);
  const net = line.qty * line.price * (1 - line.discountPct / 100);
  const avail = line.recordId ? availableOnHand(line.recordId, app.inventory) : 99;
  const ownItemHeld = app.itemFor(line.inventoryItemId)?.status === "held";
  // A hold has already committed its own copy — don't flag it as negative stock.
  const goesNegative =
    line.kind === "item" && line.qty > 0 && line.qty > avail && !ownItemHeld;

  return (
    <tr>
      <td>
        <div>{line.title}</div>
        <div className="xsmall muted">
          {line.grade && <span className="badge grade">{line.grade}</span>} {line.kind}
          {line.linkedSaleNumber ? ` · linked #${line.linkedSaleNumber}` : ""}
        </div>
        {line.note && <div className="xsmall muted">{line.note}</div>}
        {goesNegative && (
          <div className="callout danger" style={{ marginTop: 4 }}>
            Stock would go negative ({avail} available). Till completes the Sale anyway — reconcile in
            E-04. {rec ? "" : ""}
          </div>
        )}
      </td>
      <td className="num">
        <input
          className="inline-num"
          type="number"
          value={line.qty}
          disabled={locked}
          onChange={(e) => app.updateLine(sale.id, line.id, { qty: Number(e.target.value) })}
        />
      </td>
      <td className="num">
        <input
          className="inline-num"
          type="number"
          step="0.01"
          value={line.price}
          disabled={locked}
          onChange={(e) => app.updateLine(sale.id, line.id, { price: Number(e.target.value) })}
        />
      </td>
      <td className="num">
        <input
          className="inline-pct"
          type="number"
          value={line.discountPct}
          disabled={locked}
          onChange={(e) => app.updateLine(sale.id, line.id, { discountPct: Number(e.target.value) })}
        />
      </td>
      <td>
        <select
          value={line.taxLineId}
          disabled={locked}
          onChange={(e) => app.updateLine(sale.id, line.id, { taxLineId: e.target.value })}
        >
          {app.taxLines.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td className="num">{money(net)}</td>
      <td className="num">
        {!locked && (
          <button className="btn ghost sm" onClick={() => app.removeLine(sale.id, line.id)}>
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

function PricePrompt({
  title,
  help,
  defaultValue,
  onConfirm,
  onCancel,
}: {
  title: string;
  help: string;
  defaultValue: number;
  onConfirm: (v: number) => void;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState(String(defaultValue));
  return (
    <Modal
      title={title}
      onClose={onCancel}
      foot={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onConfirm(Number(raw) || 0)}>
            Confirm
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="callout">{help}</div>
        <label className="field">
          <span>Price</span>
          <input type="number" step="0.01" autoFocus value={raw} onChange={(e) => setRaw(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function TenderModal({
  due,
  hasCustomer,
  onAdd,
  onClose,
}: {
  due: number;
  hasCustomer: boolean;
  onAdd: (t: { type: TenderType; amount: number; note?: string; reference?: string }) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<TenderType>("Cash");
  const [raw, setRaw] = useState(String(Math.max(0, due).toFixed(2)));
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const amount = Number(raw) || 0;

  const needsCustomer = type === "Store Credit" && !hasCustomer;
  const needsNote = type === "Pay-out" && note.trim().length === 0;
  const isNegativeType = type === "Pay-out";

  return (
    <Modal
      title="Add tender"
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={amount <= 0 || needsCustomer || needsNote}
            onClick={() =>
              onAdd({
                type,
                amount: isNegativeType ? -Math.abs(amount) : amount,
                note: note.trim() || undefined,
                reference: reference.trim() || undefined,
              })
            }
          >
            Add {isNegativeType ? "-" : ""}
            {money(amount)}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as TenderType)}>
            {TENDERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Amount</span>
          <input type="number" step="0.01" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </label>

        {type === "Credit Card" && (
          <div className="callout">
            Recorded only — the card is settled on a separate terminal. No third-party processor,
            no card data (E-05 decision 9).
          </div>
        )}
        {type === "Cash" && amount > due && due > 0 && (
          <div className="callout ok">Change owed: {money(amount - due)}</div>
        )}
        {(type === "Gift Card") && (
          <label className="field">
            <span>Gift card code</span>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="GC-4417" />
          </label>
        )}
        {type === "Store Credit" && (
          <div className={"callout" + (needsCustomer ? " danger" : "")}>
            Draws against the Customer’s account balance — requires a Customer on the Sale.
            {needsCustomer && " No Customer attached."}
          </div>
        )}
        {type === "Used Credit" && (
          <div className="callout">
            Buying second-hand stock over the counter. Creates a balance owing to the customer,
            settled to store credit or a negative-cash payout (E-05 decision 14). Stock enters
            separately via E-02.
          </div>
        )}
        {type === "Pay-out" && (
          <label className="field">
            <span>Note (required — describes the purpose)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. courier COD" />
          </label>
        )}
      </div>
    </Modal>
  );
}
