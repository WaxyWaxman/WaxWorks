import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarcodeInput } from "../components/BarcodeInput";
import { Modal } from "../components/Modal";
import { TillRail } from "../components/TillRail";
import { VoidSaleModal } from "../components/VoidSaleModal";
import { CURRENT_USER } from "../data/seed";
import type { InventoryItem, RecordEntry, Sale, SaleLine, TenderType } from "../data/types";
import { money } from "../lib/money";
import { resolveScan } from "../lib/resolve";
import { availableOnHand, balanceDue, saleTotals } from "../lib/totals";
import { useApp } from "../store/AppStore";

const TENDERS: TenderType[] = ["Cash", "Credit Card", "Account Balance", "Gift Card", "Pay-out", "Used Credit"];

export function PointOfSale() {
  const app = useApp();
  const nav = useNavigate();
  const { saleId } = useParams();

  // A Return is a Sale with isReturn set, but it's edited at E-06's own
  // screen (return-specific fields: link to a prior Sale, refund, stock
  // routing) — this is the counterpart to ReturnScreen's redirect the other
  // way, so a stray /sell/:id link to a Return lands somewhere useful.
  useEffect(() => {
    const target = app.sales.find((s) => s.id === saleId);
    if (target?.isReturn) {
      nav(`/return/${target.id}`, { replace: true });
      return;
    }
    if (saleId && saleId !== app.activeSaleId) app.setActiveSale(saleId);
  }, [saleId, app.sales]); // eslint-disable-line react-hooks/exhaustive-deps

  // On entry (no Sale picked yet) — the most recent Sale, or the most
  // recent Held transaction if there are no Sales yet today.
  useEffect(() => {
    if (saleId || app.activeSaleId) return;
    const byRecency = (a: Sale, b: Sale) => b.createdAt.localeCompare(a.createdAt);
    const recentSale = [...app.sales].filter((s) => !s.isReturn && (s.state === "Current" || s.state === "Open")).sort(byRecency)[0];
    const recentHeld = [...app.sales].filter((s) => !s.isReturn && s.state === "Held").sort(byRecency)[0];
    const pick = recentSale ?? recentHeld;
    if (pick) app.setActiveSale(pick.id);
  }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sale = app.activeSale;

  // Three tracks under the band: the rail (what you start), the sale, and the
  // money. Each scrolls on its own — the page itself does not (E-05 d29).
  return (
    <div className="till-frame">
      <TillRail activeSaleId={sale?.id} />

      {sale && !sale.isReturn ? (
        <SaleEditor key={sale.id} />
      ) : (
        <div className="till-nosale">
          <div className="stack">
            <div className="lab">No sale open</div>
            <p className="muted">Start one here, or pick something up from the rail.</p>
            <button className="btn primary" onClick={() => nav(`/sell/${app.newSale()}`)}>
              + New sale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SaleEditor() {
  const app = useApp();
  const nav = useNavigate();
  const sale = app.activeSale!;
  const totals = saleTotals(sale, app.taxLines);
  const due = balanceDue(sale, app.taxLines);
  const customer = app.customerFor(sale.customerId);

  const [picker, setPicker] = useState<{ record: RecordEntry; items: InventoryItem[] } | null>(null);
  const [negPrompt, setNegPrompt] = useState<RecordEntry | null>(null);
  const [ntPrompt, setNtPrompt] = useState<{ code: string; label: string; price: number } | null>(null);
  const [gcLoad, setGcLoad] = useState<string | null>(null);
  const [gcRedeem, setGcRedeem] = useState<{ code: string; balance: number } | null>(null);
  // The slab offers all six tender types directly, so opening the modal
  // carries which one was pressed rather than defaulting to Cash.
  const [showTender, setShowTender] = useState<TenderType | null>(null);
  const [custPick, setCustPick] = useState(false);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [loggingContact, setLoggingContact] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  // Void and Edit both destroy this Sale, so both go through the same gate:
  // the money has to be off it first (E-05 d31).
  const [voiding, setVoiding] = useState<"void" | "edit" | null>(null);

  const latestLog = sale.log.length ? sale.log[sale.log.length - 1] : null;

  // Lines/tenders/customer/PO are only editable pre-tender. Once a Sale is
  // Current it's Void-or-Edit(duplicate) only; Closed/Void are read-only.
  const fieldsLocked = sale.state !== "Open" && sale.state !== "Held";

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

  const holdAgeLabel = (() => {
    if (sale.state !== "Held") return null;
    const created = new Date(sale.createdAt.replace(" ", "T"));
    if (Number.isNaN(created.getTime())) return null;
    const ms = Date.now() - created.getTime();
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 1) return "under an hour";
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  })();

  return (
    <>
      {/* ---- the sale ---- */}
      <section className="till-main">
        {/* Which sale, what state, and the things done TO it. Void lives here
            rather than under the money, a thumb-width from the button pressed
            on every single sale (E-05 d31). */}
        <div className="till-sale-head">
          <span className="sale-head-label">{sale.isReturn ? "Return" : "Sale"}</span>
          {customer ? (
            <button
              className="sale-head-customer-btn"
              onClick={() => setCustPick(true)}
              disabled={fieldsLocked}
              title="Change customer"
            >
              {customer.name}
            </button>
          ) : (
            <button className="btn sm" onClick={() => setCustPick(true)} disabled={fieldsLocked}>
              + Add customer
            </button>
          )}
          <span className="sale-head-meta">
            {sale.saleNumber ? (
              <>
                #{sale.saleNumber}{" "}
                <span className={"badge" + (sale.state === "Closed" ? "" : " ok")}>{sale.state}</span>
              </>
            ) : sale.state === "Held" ? (
              <>
                <span className="mono">{sale.holdRef}</span> <span className="badge">Held</span>
                {holdAgeLabel && <span className="muted xsmall">on hold {holdAgeLabel}</span>}
              </>
            ) : (
              <span className="badge">Open</span>
            )}
          </span>
          {/* Every Open Sale is locked to whoever started it, so saying so on
              your own sale is noise — and in a fixed header it reads as an
              error. The lock only matters when somebody else holds it. */}
          {sale.lockedBy && sale.lockedBy !== CURRENT_USER && (
            <>
              <span className="badge warn">locked · {sale.lockedBy}</span>
              <button className="btn ghost sm" onClick={() => app.forceUnlockSale(sale.id)}>
                Force unlock
              </button>
            </>
          )}
          <span className="muted xsmall">
            {sale.lines.length} line{sale.lines.length !== 1 ? "s" : ""}
          </span>

          <span className="till-sale-acts">
            {sale.lines.length > 0 && (
              <button
                className="btn ghost sm"
                title="New Sale with the same line items — re-scan each copy"
                onClick={() => {
                  const id = app.copySale(sale.id);
                  if (id) nav(`/sell/${id}`);
                }}
              >
                Copy
              </button>
            )}
            {sale.state === "Current" && (
              <button
                className="btn ghost sm"
                title="Voids this Sale and opens a copy of it for correction — preserves the audit trail"
                onClick={() => setVoiding("edit")}
              >
                Edit
              </button>
            )}
            {sale.state === "Held" ? (
              <button className="btn danger sm" onClick={() => app.cancelHold(sale.id)}>
                Cancel hold
              </button>
            ) : (
              (sale.state === "Open" || sale.state === "Current") && (
                <button className="btn danger sm" onClick={() => setVoiding("void")}>
                  Void sale
                </button>
              )
            )}
          </span>
        </div>

        {/* The customer's terms, and the PO. Context rather than controls, but
            it stays put — attaching a customer changes every price below it. */}
        <div className="till-sale-meta">
          {customer && (
            <>
              <span className="badge">disc {customer.globalDiscountPct}%</span>
              {customer.defaultTaxLineId && (
                <span className="badge">
                  tax → {app.taxLines.find((t) => t.id === customer.defaultTaxLineId)?.name}
                </span>
              )}
              <span className={"badge " + (customer.balance >= 0 ? "ok" : "warn")}>
                balance {money(customer.balance)}
              </span>
              <button
                className="btn ghost sm"
                onClick={() => app.attachCustomer(sale.id, null)}
                disabled={fieldsLocked}
              >
                detach
              </button>
            </>
          )}
          <label className="row" style={{ gap: "var(--sp-2)" }}>
            <span className="muted xsmall">PO</span>
            <input
              className="inline-num"
              style={{ width: 120 }}
              type="text"
              value={sale.po ?? ""}
              disabled={fieldsLocked}
              onChange={(e) => app.setSalePo(sale.id, e.target.value)}
              placeholder="customer's PO #"
            />
          </label>
          {sale.state === "Held" && (
            <button className="btn ghost sm" onClick={() => setLoggingContact(true)}>
              Log contact
            </button>
          )}
        </div>

        {!fieldsLocked && (
          <div className="till-scan">
            <div className="scan-slab">
              <div className="lab" style={{ marginBottom: "var(--sp-1)" }}>
                Scan the item
              </div>
              <BarcodeInput
                onScan={onScan}
                placeholder="scan or type…"
                actionLabel="Lookup"
                onAction={() => setLookingUp(true)}
              />
            </div>
            {scanNote && (
              <div className="callout ok" style={{ marginTop: "var(--sp-2)" }}>
                {scanNote}
              </div>
            )}
          </div>
        )}

        {/* The only thing on this side that scrolls. */}
        <div className="till-lines">
          {sale.lines.map((l) => (
            <LineRow key={l.id} line={l} locked={fieldsLocked} />
          ))}
          {sale.lines.length === 0 && (
            <div className="till-empty">No lines yet — scan something.</div>
          )}
        </div>

        {/* The strip already spanned the width of the sale; closed, all it
            said was how many entries it was hiding. Now it reads the newest
            one, and still opens for the rest plus the note box. */}
        <details className="till-log">
          <summary>
            <span className="till-log-top">
              <span className="lab">Log &amp; notes ({sale.log.length})</span>
              <span className="till-log-chev" aria-hidden="true">▾</span>
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

      {/* ---- the money ----
          Amount due at the top and Finish sale on the floor are anchors; only
          the tenders scroll between them, so Finish sale sits in the same
          place on a one-line cash sale and a six-tender split (E-05 d29). */}
      <aside className="till-money">
        <div className="till-money-head">
          <div className="lab">{totals.grand < 0 ? "Refund due" : "Amount due"}</div>
          <div className="till-due">
            {money(Math.abs(due) < 0.001 && sale.tenders.length ? 0 : totals.grand)}
          </div>
          <div className="xsmall muted till-due-sub">
            Subtotal {money(totals.subtotal)}
            {/* A walk-in has no discount, and "−$0.00" is noise on the one
                number the customer is reading over your shoulder. */}
            {totals.discount > 0.001 && <> · discount −{money(totals.discount)}</>} · tax{" "}
            {money(totals.tax)}
          </div>
        </div>

        <div className="till-rule" />

        <div className="till-money-mid">
          {!fieldsLocked && (
            <div>
              <div className="lab" style={{ marginBottom: "var(--sp-2)" }}>
                Take payment
              </div>
              <div className="tender-grid">
                {TENDERS.map((t) => (
                  <button key={t} className="btn" onClick={() => setShowTender(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sale.tenders.length > 0 && (
            <div className="till-taken">
              {sale.tenders.map((t) => (
                <div key={t.id} className="tender-line">
                  <span>
                    {t.type}
                    {t.type === "Account Balance" && (
                      <span className={"badge" + (t.accountDirection === "add" ? " ok" : "")}>
                        {t.accountDirection === "add" ? "add to balance" : "draw down"}
                      </span>
                    )}
                    {t.reference ? ` · ${t.reference}` : ""}
                    {t.note ? <span className="muted"> — {t.note}</span> : ""}
                  </span>
                  <span className="row">
                    <span className="num">{money(t.amount)}</span>
                    {!fieldsLocked && (
                      <button className="btn ghost sm" onClick={() => app.removeTender(sale.id, t.id)}>
                        ✕
                      </button>
                    )}
                  </span>
                </div>
              ))}
              <div className="totals-row grand">
                <span style={{ color: due > 0.001 ? "var(--c-accent)" : undefined }}>
                  {due > 0.001 ? "Still owing" : due < -0.001 ? "Change / owed" : "Settled"}
                </span>
                <span className="num" style={{ color: due > 0.001 ? "var(--c-accent)" : undefined }}>
                  {money(Math.abs(due))}
                </span>
              </div>
            </div>
          )}

          {sale.state === "Closed" && (
            <div className="xsmall muted">
              Closed — no longer editable. Reopen via Other functions on the rail (Admin), or
              handle as a Return.
            </div>
          )}
          {due < -0.001 && sale.tenders.some((t) => t.type === "Cash") && (
            <div className="callout ok">Change owed: {money(Math.abs(due))}</div>
          )}
        </div>

        {/* The two ways a customer interaction ends: take the money, or park
            it. Return left for the rail; Void went to the sale header. */}
        {!fieldsLocked && (
          <div className="till-money-foot">
            <button
              className="btn primary till-finish"
              disabled={
                (sale.lines.length > 0 && due > 0.001) ||
                (sale.lines.length === 0 && sale.tenders.length === 0)
              }
              onClick={() => setReceipt(app.completeSale(sale.id))}
            >
              FINISH SALE
            </button>
            <button
              className="btn till-hold"
              disabled={sale.state !== "Open" || (sale.lines.length === 0 && sale.tenders.length === 0)}
              onClick={() => app.holdSale(sale.id)}
            >
              Hold
            </button>
          </div>
        )}
      </aside>

      {voiding && (
        <VoidSaleModal
          sale={sale}
          mode={voiding}
          onClose={() => setVoiding(null)}
          onDone={(nextId) => {
            setVoiding(null);
            if (nextId) nav(`/sell/${nextId}`);
          }}
        />
      )}


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

      {custPick && <CustomerPickModal saleId={sale.id} onClose={() => setCustPick(false)} />}

      {lookingUp && (
        <LookupModal
          saleId={sale.id}
          onClose={() => setLookingUp(false)}
          onAdded={setScanNote}
        />
      )}

      {showTender && (
        <TenderModal
          initialType={showTender}
          due={due}
          hasCustomer={!!customer}
          onClose={() => setShowTender(null)}
          onAdd={(t) => {
            app.addTender(sale.id, t);
            setShowTender(null);
          }}
        />
      )}

      {loggingContact && (
        <Modal title="Log contact" onClose={() => setLoggingContact(false)}>
          <div className="stack">
            <p className="small">Records who was contacted and how, as part of the hold timeline.</p>
            <div className="btn-row">
              {(["Phone", "Email"] as const).map((method) => (
                <button
                  key={method}
                  className="btn"
                  onClick={() => {
                    app.addLog(sale.id, `Customer contacted by ${method.toLowerCase()} — ${CURRENT_USER}`);
                    setLoggingContact(false);
                  }}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {receipt !== null && (
        <Modal
          title={customer?.email ? "Send receipt?" : "Print receipt?"}
          onClose={() => setReceipt(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setReceipt(null)}>
                Skip
              </button>
              <button className={"btn" + (customer?.email ? "" : " primary")} onClick={() => setReceipt(null)}>
                Print
              </button>
              <button
                className={"btn" + (customer?.email ? " primary" : "")}
                disabled={!customer?.email}
                title={customer?.email ? undefined : "No email on file for this customer"}
                onClick={() => setReceipt(null)}
              >
                Email
              </button>
            </>
          }
        >
          <div className="callout ok">
            Tendered. Sale number <strong>#{receipt}</strong> assigned. Any Sale can be reopened by
            number to reprint or email its receipt (E-05 decision 19).
            {!customer?.email && " No email on file — print is the fallback (decision 24)."}
          </div>
        </Modal>
      )}
    </>
  );
}


function CustomerPickModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const app = useApp();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = query
    ? app.customers.filter(
        (c) => c.name.toLowerCase().includes(query) || c.phone.toLowerCase().includes(query) || c.email.toLowerCase().includes(query),
      )
    : app.customers;

  return (
    <Modal title="Attach customer" onClose={onClose}>
      <div className="stack">
        <p className="small">Lookup by name, phone, or email. A Sale without a Customer is normal (E-05 decision 20).</p>
        <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
        <table className="data">
          <tbody>
            {matches.map((c) => (
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
                      app.attachCustomer(saleId, c.id);
                      onClose();
                    }}
                  >
                    Attach
                  </button>
                </td>
              </tr>
            ))}
            {matches.length === 0 && (
              <tr>
                <td colSpan={3} className="small muted">
                  No match for "{q}".
                  <button
                    className="btn sm primary"
                    style={{ marginLeft: "var(--sp-2)" }}
                    onClick={() => {
                      const id = app.addCustomer({
                        accountNumber: `A-${Math.floor(Math.random() * 9000 + 1000)}`,
                        accountType: "Regular",
                        name: q.trim(),
                        phone: "",
                        email: "",
                        contactPreference: "Phone",
                        globalDiscountPct: 0,
                      });
                      app.attachCustomer(saleId, id);
                      onClose();
                    }}
                  >
                    + Create & attach "{q}"
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// A real scan hits Enter on its own — typing and pressing Enter (or the
// sample chips) already resolves a code without a redundant button. Lookup
// covers the other case: the Employee doesn't have a code, just a name to
// search for, and wants to pick a copy off a results list to add as a line.
function LookupModal({
  saleId,
  onClose,
  onAdded,
}: {
  saleId: string;
  onClose: () => void;
  onAdded: (msg: string) => void;
}) {
  const app = useApp();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (!query) return [];
    const match = (r: RecordEntry) =>
      [r.artist, r.title, r.label, r.catalogNo, r.genre, r.section, r.manufacturerUpc]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(query));
    return app.records.filter((r) => !r.catalogOnly && match(r));
  }, [query, app.records]);

  return (
    <Modal title="Lookup — add a line" onClose={onClose}>
      <div className="stack">
        <p className="small muted">Search artist, title, label, catalog no., genre, or Section — then add a copy to the Sale.</p>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="try: blue · rumours · jazz · radiohead"
        />
        <table className="data">
          <tbody>
            {results.map((r) => {
              const copies = app.inventory.filter((i) => i.recordId === r.id && i.status === "sellable");
              return (
                <FragmentRow key={r.id}>
                  <tr className="group-row">
                    <td colSpan={3}>
                      {r.artist} — {r.title}
                      <div className="xsmall muted">
                        {r.label} · {r.catalogNo} · {r.genre}
                      </div>
                    </td>
                  </tr>
                  {copies.map((c) => (
                    <tr key={c.id} className="nested">
                      <td className="small">
                        <span className="badge grade">{c.grade}</span>{" "}
                        {c.backroom && <span className="badge warn">Backroom</span>}
                      </td>
                      <td className="num">{money(c.price)}</td>
                      <td className="num">
                        <button
                          className="btn sm primary"
                          onClick={() => {
                            app.addItemLine(saleId, c);
                            onAdded(`Added ${r.artist} — ${r.title} (${c.grade}) at ${money(c.price)}.`);
                            onClose();
                          }}
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                  {copies.length === 0 && (
                    <tr className="nested">
                      <td colSpan={3} className="small muted">
                        No sellable copies on hand.
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
            {query && results.length === 0 && (
              <tr>
                <td className="small muted">No match for "{q}".</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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
    <div className={"till-line" + (goesNegative ? " flagged" : "")}>
      <span className="art">{rec?.art ?? "—"}</span>
      <div style={{ minWidth: 0 }}>
        <div className="title">{line.title}</div>
        <div className="meta">
          {line.grade && <span className="badge grade">{line.grade}</span>} {line.kind}
          {line.qty !== 1 ? ` · qty ${line.qty}` : ""}
          {line.discountPct ? ` · ${line.discountPct}% off` : ""} · {money(line.price)}
          {line.linkedSaleNumber ? ` · linked #${line.linkedSaleNumber}` : ""}
          {line.note ? ` · ${line.note}` : ""}
        </div>
        {!locked && (
          <div className="till-controls">
            <label>
              <span>Qty</span>
              <input
                className="inline-num"
                type="number"
                value={line.qty}
                onChange={(e) => app.updateLine(sale.id, line.id, { qty: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Price</span>
              <input
                className="inline-num"
                type="number"
                step="0.01"
                value={line.price}
                onChange={(e) => app.updateLine(sale.id, line.id, { price: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Disc %</span>
              <input
                className="inline-pct"
                type="number"
                min={0}
                max={99}
                step={1}
                value={line.discountPct}
                onChange={(e) => {
                  const clamped = Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0)));
                  app.updateLine(sale.id, line.id, { discountPct: clamped });
                }}
              />
            </label>
            <label>
              <span>Tax</span>
              <select
                value={line.taxLineId}
                onChange={(e) => app.updateLine(sale.id, line.id, { taxLineId: e.target.value })}
              >
                {app.taxLines.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {goesNegative && (
          <div className="callout danger" style={{ marginTop: "var(--sp-2)" }}>
            Stock would go negative ({avail} available). The till completes the Sale anyway and
            raises a review flag — reconciled in E-04.
          </div>
        )}
      </div>
      <div className="net">{money(net)}</div>
      <div>
        {!locked && (
          <button
            className="btn ghost sm"
            title="Remove line"
            onClick={() => app.removeLine(sale.id, line.id)}
          >
            ✕
          </button>
        )}
      </div>
    </div>
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
  initialType = "Cash",
  due,
  hasCustomer,
  onAdd,
  onClose,
}: {
  initialType?: TenderType;
  due: number;
  hasCustomer: boolean;
  onAdd: (t: {
    type: TenderType;
    amount: number;
    note?: string;
    reference?: string;
    accountDirection?: "add" | "draw";
  }) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<TenderType>(initialType);
  const [raw, setRaw] = useState(String(Math.max(0, due).toFixed(2)));
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [acctDirection, setAcctDirection] = useState<"add" | "draw">("draw");
  const amount = Number(raw) || 0;

  const needsCustomer = type === "Account Balance" && !hasCustomer;
  const needsNote = type === "Pay-out" && note.trim().length === 0;
  // Negative amounts are for tenders that don't count toward paying off
  // this Sale's total — Pay-out sends cash out of the till for an expense,
  // and "add to balance" redirects an incoming tender (e.g. cash) into the
  // Customer's store credit instead of applying it to the Sale. Both need
  // an equal, opposite tender elsewhere to actually fund them; storing them
  // negative is what makes balanceDue net that out instead of double-
  // counting the money as both "received" and "credited".
  const isNegativeType = type === "Pay-out" || (type === "Account Balance" && acctDirection === "add");

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
                accountDirection: type === "Account Balance" ? acctDirection : undefined,
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
        {type === "Account Balance" && (
          <>
            <label className="field">
              <span>Direction</span>
              <div className="row">
                <label className="row">
                  <input
                    type="radio"
                    checked={acctDirection === "draw"}
                    onChange={() => setAcctDirection("draw")}
                  />
                  <span>Draw down — customer pays with existing balance</span>
                </label>
              </div>
              <div className="row">
                <label className="row">
                  <input
                    type="radio"
                    checked={acctDirection === "add"}
                    onChange={() => setAcctDirection("add")}
                  />
                  <span>Add to balance — a deposit or credit</span>
                </label>
              </div>
            </label>
            <div className={"callout" + (needsCustomer ? " danger" : "")}>
              {acctDirection === "draw"
                ? "Draws against the Customer's account balance."
                : "Adds to the Customer's account balance — a deposit on a line-less Sale, or crediting a refund (E-05 decision 25)."}
              {" "}Requires a Customer on the Sale.{needsCustomer && " No Customer attached."}
            </div>
          </>
        )}
        {type === "Used Credit" && (
          <div className="callout">
            Buying second-hand stock over the counter. Creates a balance owing to the customer,
            settled to account balance or a negative-cash payout (E-05 decision 14). Stock enters
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
