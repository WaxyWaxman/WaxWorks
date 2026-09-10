import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarcodeInput } from "../components/BarcodeInput";
import { Modal } from "../components/Modal";
import { CURRENT_USER } from "../data/seed";
import type { InventoryItem, RecordEntry, Sale, SaleLine, TenderType } from "../data/types";
import type { DayBreakdown } from "../lib/dayBreakdown";
import { money } from "../lib/money";
import { resolveScan } from "../lib/resolve";
import { availableOnHand, balanceDue, saleTotals, tenderedTotal } from "../lib/totals";
import { useApp } from "../store/AppStore";

const TENDERS: TenderType[] = ["Cash", "Credit Card", "Account Balance", "Gift Card", "Pay-out", "Used Credit"];

export function PointOfSale() {
  const app = useApp();
  const nav = useNavigate();
  const { saleId } = useParams();
  const [searching, setSearching] = useState(false);
  const [otherFns, setOtherFns] = useState(false);
  const [viewingHolds, setViewingHolds] = useState(false);

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
  const openSales = app.sales.filter((s) => s.state === "Open" && !s.isReturn);
  const heldSales = app.sales.filter((s) => s.state === "Held" && !s.isReturn);
  const openReturns = app.sales.filter((s) => s.isReturn && s.state === "Open");
  const recentCurrent = [...app.sales]
    .filter((s) => s.state === "Current" && !s.isReturn)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">E-05</span>
        <div>
          <h1>Point of Sale</h1>
          <p className="sub">
            Ring up a Sale and take payment. Split tender, holds, negative inventory, gift cards.
            Returns start here too — <strong>+ New Return</strong> opens the E-06 editor, which
            handles the refund and stock routing.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body row wrap">
          <button className="btn primary" onClick={() => nav(`/sell/${app.newSale()}`)}>
            + New Sale
          </button>
          <button className="btn" onClick={() => nav(`/return/${app.newSale({ isReturn: true })}`)}>
            + New Return
          </button>
          <button className="btn" onClick={() => setSearching(true)}>
            Search
          </button>
          <button className="btn" onClick={() => setOtherFns(true)}>
            Other Functions
          </button>
          <span className="muted xsmall">Open:</span>
          {openSales.length === 0 && <span className="xsmall muted">none</span>}
          {openSales.map((s) => (
            <button
              key={s.id}
              className={"btn sm" + (s.id === sale?.id ? " primary" : "")}
              onClick={() => nav(`/sell/${s.id}`)}
            >
              Sale · {s.lines.length} line{s.lines.length !== 1 ? "s" : ""}
            </button>
          ))}
          {openReturns.length > 0 && (
            <>
              <span className="muted xsmall">Open returns:</span>
              {openReturns.map((s) => (
                <button key={s.id} className="btn sm" onClick={() => nav(`/return/${s.id}`)}>
                  Return · {s.lines.length} line{s.lines.length !== 1 ? "s" : ""}
                </button>
              ))}
            </>
          )}
          <button className="btn" onClick={() => setViewingHolds(true)}>
            View Holds{heldSales.length > 0 ? ` (${heldSales.length})` : ""}
          </button>
          <span className="muted xsmall">Recent:</span>
          {recentCurrent.length === 0 && <span className="xsmall muted">none</span>}
          {recentCurrent.map((s) => (
            <button
              key={s.id}
              className={"btn sm" + (s.id === sale?.id ? " primary" : "")}
              onClick={() => nav(`/sell/${s.id}`)}
            >
              #{s.saleNumber}
            </button>
          ))}
        </div>
      </div>

      {!sale && <div className="callout">Start a new Sale or pick one above.</div>}
      {sale && !sale.isReturn && <SaleEditor key={sale.id} />}

      {searching && <SearchModal onClose={() => setSearching(false)} />}
      {otherFns && <OtherFunctionsModal onClose={() => setOtherFns(false)} />}
      {viewingHolds && <HoldsModal onClose={() => setViewingHolds(false)} />}
    </div>
  );
}

type HoldSort = "age" | "customer" | "ref" | "items";

// A single "View Holds" replaces one quick-scan button per Held Sale, which
// gets unreadable once a store has 20+ holds going at once — search plus
// sortable columns instead of a wall of buttons.
function HoldsModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<HoldSort>("age");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const ageMs = (sale: Sale) => {
    const created = new Date(sale.createdAt.replace(" ", "T"));
    return Number.isNaN(created.getTime()) ? 0 : Date.now() - created.getTime();
  };
  const ageLabel = (ms: number) => {
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 1) return "under an hour";
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };

  const rows = useMemo(() => {
    const held = app.sales.filter((s) => s.state === "Held" && !s.isReturn);
    const query = q.trim().toLowerCase();
    const filtered = query
      ? held.filter((s) => {
          const cust = app.customerFor(s.customerId);
          const haystack = [s.holdRef, s.po, cust?.name, cust?.phone, cust?.email, ...s.lines.map((l) => l.title)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : held;

    const withMeta = filtered.map((s) => ({ sale: s, customer: app.customerFor(s.customerId), ageMs: ageMs(s) }));
    withMeta.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "customer":
          cmp = (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "");
          break;
        case "ref":
          cmp = (a.sale.holdRef ?? "").localeCompare(b.sale.holdRef ?? "");
          break;
        case "items":
          cmp = a.sale.lines.length - b.sale.lines.length;
          break;
        case "age":
          cmp = a.ageMs - b.ageMs;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return withMeta;
  }, [app.sales, q, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key: HoldSort) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const sortArrow = (key: HoldSort) => (key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <Modal title="Held Sales" onClose={onClose}>
      <div className="stack">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by customer, hold ref, PO, or item…"
        />
        <table className="data">
          <thead>
            <tr>
              <th className="row-click" onClick={() => toggleSort("ref")}>
                Hold{sortArrow("ref")}
              </th>
              <th className="row-click" onClick={() => toggleSort("customer")}>
                Customer{sortArrow("customer")}
              </th>
              <th className="row-click" onClick={() => toggleSort("items")}>
                Items{sortArrow("items")}
              </th>
              <th className="row-click" onClick={() => toggleSort("age")}>
                Age{sortArrow("age")}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sale, customer, ageMs: age }) => (
              <tr key={sale.id}>
                <td className="mono">{sale.holdRef}</td>
                <td>{customer?.name ?? "—"}</td>
                <td className="small">
                  {sale.lines.length} line{sale.lines.length !== 1 ? "s" : ""}
                  <div className="xsmall muted">{sale.lines.map((l) => l.title).join(", ")}</div>
                </td>
                <td className="small">{ageLabel(age)}</td>
                <td className="num">
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      nav(`/sell/${sale.id}`);
                      onClose();
                    }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="small muted">
                  No holds{q ? " matching that search" : " right now"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const nav = useNavigate();
  const [code, setCode] = useState("");

  const results = useMemo(() => {
    if (!code.trim()) return [];
    const res = resolveScan(code.trim(), app);
    let recordId: string | undefined;
    let itemId: string | undefined;
    if (res.kind === "internal") {
      recordId = res.record.id;
      itemId = res.item.id;
    } else if (res.kind === "upc-single") {
      recordId = res.record.id;
    } else if (res.kind === "upc-multi") {
      recordId = res.record.id;
    } else {
      return [];
    }
    const matches: { sale: Sale; line: SaleLine }[] = [];
    for (const sale of app.sales) {
      for (const line of sale.lines) {
        if (itemId ? line.inventoryItemId === itemId : line.recordId === recordId) matches.push({ sale, line });
      }
    }
    // Held Sales surface first so they can be selected and tendered, then most recent.
    return matches.sort((a, b) => {
      if ((a.sale.state === "Held") !== (b.sale.state === "Held")) return a.sale.state === "Held" ? -1 : 1;
      return b.sale.createdAt.localeCompare(a.sale.createdAt);
    });
  }, [code, app]);

  return (
    <Modal title="Search — item sale history" onClose={onClose}>
      <div className="stack">
        <BarcodeInput onScan={setCode} placeholder="Scan or type a barcode…" />
        {code && (
          <table className="data">
            <tbody>
              {results.map(({ sale, line }) => (
                <tr key={line.id}>
                  <td>
                    {line.title}
                    <div className="xsmall muted">
                      {sale.state === "Held" ? (
                        <span className="badge">Held · {sale.holdRef}</span>
                      ) : (
                        <span className="badge">{sale.state}{sale.saleNumber ? ` · #${sale.saleNumber}` : ""}</span>
                      )}{" "}
                      {sale.createdAt}
                    </div>
                  </td>
                  <td className="num">{money(line.price)}</td>
                  <td className="num">
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        nav(`/sell/${sale.id}`);
                        onClose();
                      }}
                    >
                      {sale.state === "Held" ? "Select & tender" : "Open"}
                    </button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td className="small muted">No sale history for that barcode.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

function OtherFunctionsModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [breakdown, setBreakdown] = useState<{ closing: boolean; data: DayBreakdown } | null>(null);
  const openBatches = app.closeBatches.filter((b) => !b.undoneAt);

  if (breakdown) {
    return (
      <Modal title={breakdown.closing ? "Today's Sales — Totalled" : "Subtotal"} onClose={onClose}>
        <BreakdownView data={breakdown.data} />
        {breakdown.closing && (
          <div className="callout ok" style={{ marginTop: "var(--sp-3)" }}>
            Current Sales moved to Closed. Undo from Other Functions if needed.
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="Other Functions" onClose={onClose}>
      <div className="stack">
        <div className="card">
          <div className="card-body btn-row">
            <button className="btn" onClick={() => setBreakdown({ closing: false, data: app.viewSubtotal() })}>
              View Subtotal
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const { breakdown: data } = app.totalTodaysSales(CURRENT_USER);
                setBreakdown({ closing: true, data });
              }}
            >
              Total Today's Sales
            </button>
          </div>
          <div className="card-body xsmall muted" style={{ paddingTop: 0 }}>
            Total Today's Sales moves every Current Sale to Closed — no longer editable except via
            Undo End of Day below (M-03).
          </div>
        </div>

        <div className="card">
          <div className="card-head">Undo End of Day (Admin)</div>
          <div className="card-body stack">
            {openBatches.length === 0 && <p className="small muted">No batches to undo.</p>}
            {openBatches.map((b) => (
              <div key={b.id} className="row" style={{ justifyContent: "space-between" }}>
                <span className="small">
                  Batch <span className="mono">{b.id}</span> — {b.saleIds.length} Sale
                  {b.saleIds.length === 1 ? "" : "s"} — {b.at} by {b.by}
                </span>
                <button className="btn sm danger" onClick={() => app.undoEndOfDay(b.id, CURRENT_USER)}>
                  Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function BreakdownView({ data }: { data: DayBreakdown }) {
  return (
    <div className="stack">
      <table className="data">
        <tbody>
          <tr>
            <td className="muted">Transactions</td>
            <td className="num">{data.transactionCount}</td>
          </tr>
          <tr>
            <td className="muted">Gross sales</td>
            <td className="num">{money(data.grossSales)}</td>
          </tr>
          <tr>
            <td className="muted">Returns</td>
            <td className="num">{money(data.returnsAmount)}</td>
          </tr>
          <tr>
            <td className="muted">Net sales</td>
            <td className="num">
              <strong>{money(data.netSales)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="card">
        <div className="card-head">By Section</div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <tbody>
              {data.bySection.map((s) => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td className="num">{money(s.amount)}</td>
                </tr>
              ))}
              {data.bySection.length === 0 && (
                <tr>
                  <td className="small muted">Nothing sold.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">By Tender</div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <tbody>
              {data.byTender.map((t) => (
                <tr key={t.type}>
                  <td>{t.type}</td>
                  <td className="num">{money(t.amount)}</td>
                </tr>
              ))}
              {data.byTender.length === 0 && (
                <tr>
                  <td className="small muted">Nothing tendered.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Tax</div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <tbody>
              {data.byTaxLine.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td className="num">{money(t.amount)}</td>
                </tr>
              ))}
              {data.byTaxLine.length === 0 && (
                <tr>
                  <td className="small muted">No tax collected.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Movements</div>
        <div className="card-body small stack">
          <div>Voids: {data.voidCount}</div>
          <div>Holds created: {data.holdsCreatedCount}</div>
          <div>Holds cancelled: {data.holdsCancelledCount}</div>
          {data.payouts.map((p, i) => (
            <div key={i} className="xsmall muted">
              Pay-out {p.saleLabel} — {money(p.amount)} — {p.note}
            </div>
          ))}
        </div>
      </div>

      {data.belowMin.length > 0 && (
        <div className="card">
          <div className="card-head">Stock position — below minimum</div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data">
              <tbody>
                {data.belowMin.map((r) => (
                  <tr key={r.recordId}>
                    <td className="small">{r.label}</td>
                    <td className="num small">
                      {r.onHand} / {r.minOnHand}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  const [showTender, setShowTender] = useState(false);
  const [custPick, setCustPick] = useState(false);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [loggingContact, setLoggingContact] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

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
    <div className="sell">
      <div className="stack">
        <div className="card">
          <div className="card-head sale-head">
            <div className="sale-head-left">
              <span className="sale-head-label">Sale</span>
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
                <button className="btn primary" onClick={() => setCustPick(true)} disabled={fieldsLocked}>
                  + Add customer
                </button>
              )}
              <span className="sale-head-meta">
                {sale.saleNumber ? (
                  <>
                    #{sale.saleNumber} <span className={"badge" + (sale.state === "Closed" ? "" : " ok")}>{sale.state}</span>
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
              {sale.lockedBy && (
                <>
                  <span className="badge accent">locked · {sale.lockedBy}</span>
                  <button className="btn ghost sm" onClick={() => app.forceUnlockSale(sale.id)}>
                    Force unlock
                  </button>
                </>
              )}
            </div>
            <div className="btn-row">
              {sale.state === "Current" && (
                <button
                  className="btn sm"
                  onClick={() => {
                    const id = app.editSale(sale.id);
                    if (id) nav(`/sell/${id}`);
                  }}
                  title="Voids this Sale and opens a copy of it for correction — preserves the audit trail"
                >
                  Edit
                </button>
              )}
              <button
                className="btn sm"
                disabled={sale.lines.length === 0}
                onClick={() => {
                  const id = app.copySale(sale.id);
                  if (id) nav(`/sell/${id}`);
                }}
                title="New Sale with the same line items — re-scan each copy"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="card-body stack">
            <div className="row wrap">
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
                  <button className="btn ghost sm" onClick={() => app.attachCustomer(sale.id, null)} disabled={fieldsLocked}>
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
              <BarcodeInput onScan={onScan} actionLabel="Lookup" onAction={() => setLookingUp(true)} />
            )}
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
                  <LineRow key={l.id} line={l} locked={fieldsLocked} />
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
          <div className="card-body btn-row" style={{ paddingTop: 0 }}>
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
              <span>{due > 0 ? "Balance due" : due < 0 ? "Change / owed" : "Settled"}</span>
              <span className="num">{money(Math.abs(due))}</span>
            </div>
            {!fieldsLocked && (
              <div className="btn-row" style={{ marginTop: "var(--sp-3)" }}>
                <button className="btn" onClick={() => setShowTender(true)}>
                  Add tender
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-body btn-row">
            {!fieldsLocked && (
              <button
                className="btn primary lg"
                disabled={
                  (sale.lines.length > 0 && due > 0.001) ||
                  (sale.lines.length === 0 && sale.tenders.length === 0)
                }
                onClick={() => setReceipt(app.completeSale(sale.id))}
              >
                Tender &amp; finish
              </button>
            )}
            {sale.state === "Open" && (
              <button
                className="btn"
                disabled={sale.lines.length === 0 && sale.tenders.length === 0}
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
            {(sale.state === "Open" || sale.state === "Current") && (
              <button className="btn danger" onClick={() => app.voidSale(sale.id)}>
                Void
              </button>
            )}
          </div>
          {sale.state === "Closed" && (
            <div className="card-body xsmall muted" style={{ paddingTop: 0 }}>
              Closed — no longer editable. Reopen via Undo End of Day (Other Functions, Admin) or
              handle as a Return.
            </div>
          )}
          {due < -0.001 && sale.tenders.some((t) => t.type === "Cash") && (
            <div className="card-body">
              <div className="callout ok">Change owed: {money(Math.abs(due))}</div>
            </div>
          )}
        </div>
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
          due={due}
          hasCustomer={!!customer}
          onClose={() => setShowTender(false)}
          onAdd={(t) => {
            app.addTender(sale.id, t);
            setShowTender(false);
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
    </div>
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
          min={0}
          max={99}
          step={1}
          value={line.discountPct}
          disabled={locked}
          onChange={(e) => {
            const clamped = Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0)));
            app.updateLine(sale.id, line.id, { discountPct: clamped });
          }}
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
  onAdd: (t: {
    type: TenderType;
    amount: number;
    note?: string;
    reference?: string;
    accountDirection?: "add" | "draw";
  }) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<TenderType>("Cash");
  const [raw, setRaw] = useState(String(Math.max(0, due).toFixed(2)));
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [acctDirection, setAcctDirection] = useState<"add" | "draw">("draw");
  const amount = Number(raw) || 0;

  const needsCustomer = type === "Account Balance" && !hasCustomer;
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
