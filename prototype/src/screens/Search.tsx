import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarcodeInput } from "../components/BarcodeInput";
import { ReserveModal } from "../components/ReserveModal";
import { TitlecardPanel } from "../components/TitlecardPanel";
import type { RecordEntry } from "../data/types";
import { resolveScan } from "../lib/resolve";
import { money } from "../lib/money";
import {
  STOCK_HEADING,
  STOCK_LABEL,
  STOCK_STATES,
  stampAgo,
  stampLead,
  stockFacts,
  stockRank,
  type StockFacts,
  type StockState,
} from "../lib/stockState";
import { useApp } from "../store/AppStore";

// E-03 Search and E-04 Titlecard share one screen: the titlecard for the
// selected Record sits at the top, search + results below it to find or
// switch to a different one. Selection is carried in the URL (recordId) so
// it's deep-linkable and independent of what the search box currently
// filters — picking a new Record doesn't lose your place if you go on to
// type a different search term.
//
// Results are one ranked list carrying STOCK STATE — here now, on the way,
// had before, never stocked (see lib/stockState). E-03 already put all four
// kinds of thing in scope; what it never said was how an employee tells them
// apart while a customer waits. The band heading is the answer to "do you
// have it?", and the right-hand stamp adds the half that decides a reorder:
// how long since one moved.
export function Search() {
  const app = useApp();
  const nav = useNavigate();
  const { recordId } = useParams();
  const [term, setTerm] = useState("blue");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [reserveRecord, setReserveRecord] = useState<RecordEntry | null>(null);
  // Cost is hidden by default — a customer standing at the counter can read
  // this screen too. One toggle (in the titlecard's Copies card) covers both
  // the panel above and the nested cost figures in the results table below.
  const [showCost, setShowCost] = useState(false);
  // Null means "all four states". Filtering narrows the same ranked list
  // rather than switching to a different one, so the bands never move.
  const [stateFilter, setStateFilter] = useState<StockState | null>(null);

  const scored = useMemo(() => {
    const q = term.trim().toLowerCase();
    const match = (r: RecordEntry) =>
      !q ||
      [r.artist, r.title, r.label, r.catalogNo, r.genre, r.section, r.manufacturerUpc]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));

    const input = { inventory: app.inventory, pendingOrders: app.pendingOrders, sales: app.sales };
    const rows = app.records
      // A catalog-only match is a provider result: when the provider is down
      // it simply isn't there to show (E-03 decision 8).
      .filter((r) => match(r) && (app.discogsUp || !r.catalogOnly))
      .map((r) => ({ record: r, facts: stockFacts(r, input) }));

    // E-03 decision 4 — stock we hold sorts first. The four states extend that
    // into one ranked list: here, on the way, had before, never stocked, with
    // the most stock first inside each band.
    rows.sort(
      (a, b) =>
        stockRank(a.facts.state) - stockRank(b.facts.state) ||
        b.facts.onHand - a.facts.onHand ||
        a.record.artist.localeCompare(b.record.artist),
    );
    return rows;
  }, [term, app.records, app.inventory, app.pendingOrders, app.sales, app.discogsUp]);

  const counts = useMemo(() => {
    const c: Record<StockState, number> = { here: 0, coming: 0, before: 0, never: 0 };
    for (const row of scored) c[row.facts.state] += 1;
    return c;
  }, [scored]);

  const results = useMemo(
    () => (stateFilter ? scored.filter((r) => r.facts.state === stateFilter) : scored),
    [scored, stateFilter],
  );

  // Selection defaults to the last-searched/added item (E-04) — the top
  // result — but a URL recordId always wins, so a selection survives typing
  // a new search term into the box below.
  const selectedId = recordId ?? results[0]?.record.id ?? scored[0]?.record.id;
  const selectedRecord = app.recordFor(selectedId);

  const select = (id: string) => nav(`/search/${id}`, { replace: true });

  const doScan = (code: string) => {
    const res = resolveScan(code, app);
    if (res.kind === "internal") {
      setStatusMsg(`Internal barcode → one copy: ${res.record.title} (${res.item.grade}).`);
      select(res.record.id);
    } else if (res.kind === "upc-single" || res.kind === "upc-multi") {
      setStatusMsg(`Manufacturer UPC → Record: ${res.record.title}.`);
      select(res.record.id);
    } else if (res.kind === "giftcard") {
      setStatusMsg(`Gift card ${res.card.code} — balance ${money(res.card.balance)}. (Handled at the till, not search.)`);
    } else if (res.kind === "nontracked") {
      setStatusMsg(`Non-tracked item ${res.item.code}. (Handled at the till, not search.)`);
    } else {
      setStatusMsg(`No match for “${code}”.`);
    }
  };

  return (
    <div>
      {selectedRecord ? (
        <TitlecardPanel
          recordId={selectedRecord.id}
          onStatus={setStatusMsg}
          showCost={showCost}
          onToggleShowCost={() => setShowCost((v) => !v)}
        />
      ) : (
        <div className="callout">No item selected yet — search for something below.</div>
      )}

      <hr className="hr" style={{ margin: "var(--sp-5) 0" }} />

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body stack">
          <label className="field" style={{ margin: 0 }}>
            <span>Search — artist, title, label, catalog no., genre, Section, UPC</span>
            <input
              type="search"
              value={term}
              autoFocus
              onChange={(e) => setTerm(e.target.value)}
              placeholder="try: blue · rumours · jazz · warner · radiohead"
            />
          </label>
          <BarcodeInput onScan={doScan} placeholder="…or scan a barcode to resolve directly" />
          {statusMsg && <div className="callout ok">{statusMsg}</div>}
          {!app.discogsUp && (
            <div className="callout danger">
              The catalog provider is unreachable — catalog-only rows are hidden. Local inventory
              and every till function are unaffected. <em>(E-03 decision 8 — visible, not silent.)</em>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          Results
          <span className="muted xsmall">
            {results.length} shown{stateFilter ? ` of ${scored.length}` : ""} · E-03
          </span>
        </div>

        <div
          className="card-body row wrap"
          style={{ gap: "var(--sp-2)", borderBottom: "1px solid var(--c-border)" }}
        >
          <button
            className={"filter-chip" + (stateFilter === null ? " on" : "")}
            onClick={() => setStateFilter(null)}
          >
            All <span className="count">{scored.length}</span>
          </button>
          {STOCK_STATES.map((st) => (
            <button
              key={st}
              className={"filter-chip" + (stateFilter === st ? " on" : "")}
              onClick={() => setStateFilter(stateFilter === st ? null : st)}
              disabled={counts[st] === 0}
            >
              <span className={"stock-dot " + st} />
              {STOCK_LABEL[st]} <span className="count">{counts[st]}</span>
            </button>
          ))}
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Record</th>
                <th>Format · Year</th>
                <th className="num">On hand</th>
                <th className="num">Avail.</th>
                <th className="num">Held</th>
                <th>Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={7} className="small muted" style={{ padding: "var(--sp-4)" }}>
                    Nothing matches that search in this band.
                  </td>
                </tr>
              )}
              {results.map(({ record: r, facts }, i) => {
                const copies = app.inventory.filter(
                  (c) => c.recordId === r.id && c.status !== "sold",
                );
                const sellable = copies.filter((c) => c.status === "sellable");
                const isSelected = r.id === selectedId;
                const startsBand = i === 0 || results[i - 1].facts.state !== facts.state;
                return (
                  <FragmentRow key={r.id}>
                    {startsBand && (
                      <tr className="band-row">
                        <td colSpan={7}>
                          <span className={"stock-chip " + facts.state}>
                            <span className={"stock-dot " + facts.state} />
                            {STOCK_HEADING[facts.state]}
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr
                      className={"group-row row-click" + (isSelected ? " selected" : "")}
                      onClick={() => select(r.id)}
                    >
                      <td>
                        <div className="row">
                          <span className={"stock-dot " + facts.state} />
                          <span className="cover" style={{ width: 34, height: 34, fontSize: 16 }}>
                            {r.art}
                          </span>
                          <div>
                            <div>
                              {r.artist} — {r.title}
                            </div>
                            <div className="xsmall muted">
                              {r.label} · {r.catalogNo} · {r.genre} · {r.section}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="small">
                        {r.format} · {r.year}
                      </td>
                      <td className="num">{facts.onHand || "—"}</td>
                      <td className="num">{facts.available || "—"}</td>
                      <td className="num">{facts.held || "—"}</td>
                      <td>
                        <StockStamp facts={facts} />
                      </td>
                      <td className="num">
                        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn sm"
                            title="M-02 — not in this pass"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Order
                          </button>
                          {sellable.length > 0 && (
                            <button
                              className="btn sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReserveRecord(r);
                              }}
                            >
                              Put on hold
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {copies.map((c) => (
                      <tr
                        key={c.id}
                        className={"nested row-click" + (isSelected ? " selected" : "")}
                        onClick={() => select(r.id)}
                      >
                        <td className="small">
                          <span className="badge grade">{c.grade}</span>{" "}
                          {c.backroom && <span className="badge warn">Backroom</span>}{" "}
                          {c.status === "held" && <span className="badge">Held</span>}
                          <span className="mono muted"> {c.internalBarcode}</span>
                          {c.conditionNote && <div className="xsmall muted">{c.conditionNote}</div>}
                        </td>
                        <td className="small muted">cost {showCost ? money(c.cost) : "••••"}</td>
                        <td className="num" colSpan={4}>
                          {money(c.price)}
                        </td>
                        <td />
                      </tr>
                    ))}
                    {copies.length === 0 && (
                      <tr
                        className={"nested row-click" + (isSelected ? " selected" : "")}
                        onClick={() => select(r.id)}
                      >
                        <td colSpan={7} className="small muted">
                          <NoCopiesLine facts={facts} />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {reserveRecord && (
        <ReserveModal
          record={reserveRecord}
          items={app.inventory.filter(
            (i) => i.recordId === reserveRecord.id && i.status === "sellable",
          )}
          onClose={() => setReserveRecord(null)}
          onDone={(confirmation) => {
            setReserveRecord(null);
            setStatusMsg(confirmation);
          }}
        />
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// The right-hand stamp: what we have, and how long since one moved. Recency is
// the half that answers "is this a title that sells?" — a record we have had
// three times and sold out of reads very differently from one that sat.
function StockStamp({ facts }: { facts: StockFacts }) {
  const ago = stampAgo(facts);
  return (
    <div className="stock-stamp">
      <div className={"lead " + facts.state}>{stampLead(facts)}</div>
      {ago && <div className="ago">{ago}</div>}
      {facts.state === "here" && facts.onOrder > 0 && (
        <div className="ago">+{facts.onOrder} on order</div>
      )}
      {/* Raised but not placed is worth showing and worth keeping distinct —
          it is not a promise anyone can make to a customer yet (M-02). */}
      {facts.raised > 0 && <div className="ago">{facts.raised} being ordered</div>}
    </div>
  );
}

// A Record with no copies is not one situation but three, and telling them
// apart is the whole point of the stock states.
function NoCopiesLine({ facts }: { facts: StockFacts }) {
  if (facts.state === "coming") {
    return (
      <>
        None on hand — {facts.onOrder} on order, so “it’s coming” is answerable without leaving the
        screen.
      </>
    );
  }
  if (facts.state === "before") {
    return (
      <>
        None on hand — but we have stocked it before
        {facts.everSold > 0 ? `, and sold ${facts.everSold}` : ""}.{" "}
        {facts.raised > 0
          ? `${facts.raised} raised on a supplier stream, not placed yet (M-02).`
          : "Orderable."}
      </>
    );
  }
  return (
    <>
      Catalog match — we have never stocked this.{" "}
      {facts.raised > 0
        ? `${facts.raised} raised on a supplier stream, not placed yet (M-02).`
        : "“No, but we can order it.”"}
    </>
  );
}
