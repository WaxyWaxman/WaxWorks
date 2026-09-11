import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarcodeInput } from "./BarcodeInput";
import { Modal } from "./Modal";
import { CURRENT_USER } from "../data/seed";
import type { Sale } from "../data/types";
import type { DayBreakdown } from "../lib/dayBreakdown";
import { money } from "../lib/money";
import { resolveScan } from "../lib/resolve";
import { saleTotals } from "../lib/totals";
import { useApp } from "../store/AppStore";

// The things nobody touches with a customer waiting: past Sales, the holds
// list, and the day close (M-03). They belong to the TILL rather than to the
// Sell screen — the rail carries them, so every screen that mounts the rail
// gets them, Returns included (E-05 d30, E-06 d9).

type HoldSort = "age" | "customer" | "ref" | "items";

// A single "View Holds" replaces one quick-scan button per Held Sale, which
// gets unreadable once a store has 20+ holds going at once — search plus
// sortable columns instead of a wall of buttons.
export function HoldsModal({ onClose }: { onClose: () => void }) {
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

// The primary job here is scanning recent Current Sales for entry errors
// before end-of-day close, not hunting for one item's history — so the
// default (nothing typed) is a plain recency list of Current Sales, and
// item/transaction/customer/date each narrow it further. Any filter widens
// scope to every non-Open Sale, since by then the Employee is looking for
// something specific rather than skimming.
export function SearchModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [txQuery, setTxQuery] = useState("");
  const [custQuery, setCustQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");

  // Resolves the same way the till's barcode field does: an internal
  // barcode narrows to one copy, a manufacturer UPC narrows to the Record
  // (any copy sold under it, since condition/price vary line to line).
  const codeFilter = useMemo(() => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const res = resolveScan(trimmed, app);
    if (res.kind === "internal") return { itemId: res.item.id as string | undefined, recordId: res.record.id as string | undefined, noMatch: false };
    if (res.kind === "upc-single" || res.kind === "upc-multi")
      return { itemId: undefined, recordId: res.record.id as string | undefined, noMatch: false };
    return { itemId: undefined, recordId: undefined, noMatch: true };
  }, [code, app]);

  const hasFilter = !!(code.trim() || txQuery.trim() || custQuery.trim() || dateQuery);

  const rows = useMemo(() => {
    const txQ = txQuery.trim().toLowerCase();
    const custQ = custQuery.trim().toLowerCase();

    const matches = (sale: Sale) => {
      if (codeFilter) {
        if (codeFilter.noMatch) return false;
        const onSale = sale.lines.some((l) =>
          codeFilter.itemId ? l.inventoryItemId === codeFilter.itemId : l.recordId === codeFilter.recordId,
        );
        if (!onSale) return false;
      }
      if (txQ) {
        const label = (sale.saleNumber ? String(sale.saleNumber) : sale.holdRef ?? "").toLowerCase();
        if (!label.includes(txQ)) return false;
      }
      if (custQ) {
        const cust = app.customerFor(sale.customerId);
        if (!cust?.name.toLowerCase().includes(custQ)) return false;
      }
      if (dateQuery && sale.createdAt.slice(0, 10) !== dateQuery) return false;
      return true;
    };

    const scope = hasFilter ? app.sales.filter((s) => s.state !== "Open") : app.sales.filter((s) => s.state === "Current");
    return scope.filter(matches).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [app.sales, codeFilter, txQuery, custQuery, dateQuery, hasFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Search — past Sales" onClose={onClose} wide>
      <div className="stack">
        <p className="small muted">
          {hasFilter
            ? `${rows.length} matching Sale${rows.length !== 1 ? "s" : ""}, most recent first.`
            : "Current Sales, most recent first. Scan an item, or search by transaction #, customer, or date to widen the search to every Sale."}
        </p>
        <div className="row wrap">
          <label className="field" style={{ margin: 0, flex: "1 1 160px" }}>
            <span>Transaction # / hold ref</span>
            <input type="text" value={txQuery} onChange={(e) => setTxQuery(e.target.value)} placeholder="e.g. 100241 or H3" />
          </label>
          <label className="field" style={{ margin: 0, flex: "1 1 160px" }}>
            <span>Customer name</span>
            <input type="text" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="e.g. Vasquez" />
          </label>
          <label className="field" style={{ margin: 0, flex: "1 1 160px" }}>
            <span>Date</span>
            <input type="date" value={dateQuery} onChange={(e) => setDateQuery(e.target.value)} />
          </label>
        </div>
        <BarcodeInput onScan={setCode} placeholder="…or scan/type an item barcode" />
        {code && codeFilter?.noMatch && <div className="callout danger">No catalog match for "{code}".</div>}

        <table className="data">
          <thead>
            <tr>
              <th>Sale</th>
              <th>When</th>
              <th>Customer</th>
              <th>Items</th>
              <th className="num">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((sale) => {
              const cust = app.customerFor(sale.customerId);
              const totals = saleTotals(sale, app.taxLines);
              return (
                <tr key={sale.id}>
                  <td>
                    {sale.isReturn && <span className="badge warn">Return</span>}{" "}
                    {sale.saleNumber ? (
                      <>
                        #{sale.saleNumber}{" "}
                        <span className={"badge" + (sale.state === "Closed" ? "" : sale.state === "Void" ? " danger" : " ok")}>
                          {sale.state}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="mono">{sale.holdRef}</span> <span className="badge">{sale.state}</span>
                      </>
                    )}
                  </td>
                  <td className="small mono">{sale.createdAt}</td>
                  <td className="small">{cust?.name ?? "—"}</td>
                  <td className="small muted">
                    {sale.lines.length} line{sale.lines.length !== 1 ? "s" : ""}
                    <div className="xsmall">{sale.lines.map((l) => l.title).join(", ")}</div>
                  </td>
                  <td className="num">{money(totals.grand)}</td>
                  <td className="num">
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        nav(sale.isReturn ? `/return/${sale.id}` : `/sell/${sale.id}`);
                        onClose();
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="small muted">
                  No Sales match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function OtherFunctionsModal({ onClose }: { onClose: () => void }) {
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
                <tr key={t.label}>
                  <td>{t.label}</td>
                  <td className="num">{money(t.amount)}</td>
                </tr>
              ))}
              {/* Money through the tenders that was not a sale, so this
                  column can be reconciled against net sales rather than
                  quietly disagreeing with it (M-03 d14). */}
              {data.giftCardsLoaded !== 0 && (
                <tr>
                  <td className="muted">
                    of which gift cards loaded
                    <div className="xsmall muted">money in, not a sale — a balance the store now owes</div>
                  </td>
                  <td className="num muted">{money(data.giftCardsLoaded)}</td>
                </tr>
              )}
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
